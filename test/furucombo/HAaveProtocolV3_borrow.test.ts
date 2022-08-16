import { Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  IERC20,
  FurucomboRegistry,
  IATokenV3,
  SimpleToken,
  IPool,
  HAaveProtocolV3,
  FurucomboProxyMock,
  IVariableDebtToken,
  IStableDebtToken,
} from '../../typechain';

import {
  DAI_TOKEN,
  WETH_TOKEN,
  COMP_TOKEN,
  USDC_TOKEN,
  WMATIC_TOKEN,
  ADAI_V3_TOKEN,
  AAVE_RATEMODE,
  AUSDC_V3_DEBT_STABLE,
  AWETH_V3_DEBT_VARIABLE,
  AWMATIC_V3_DEBT_VARIABLE,
  AAVEPROTOCOL_V3_PROVIDER,
} from '../utils/constants';

import { ether, mwei, profileGas, simpleEncode, asciiToHex32, tokenProviderQuick } from '../utils/utils';

describe('Aave V3 Borrow', function () {
  const aTokenAddress = ADAI_V3_TOKEN;
  const tokenAddress = DAI_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token: IERC20;
  let borrowToken: IERC20;
  let wmatic: IERC20;
  let aToken: IATokenV3;
  let mockToken: SimpleToken;
  let providerAddress: Signer;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hAaveV3: HAaveProtocolV3;
  let pool: IPool;

  let userBalance: BigNumber;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    providerAddress = await tokenProviderQuick(tokenAddress);
    token = await ethers.getContractAt('IERC20', tokenAddress);
    aToken = await ethers.getContractAt('IATokenV3', aTokenAddress);
    wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
    mockToken = await (await ethers.getContractFactory('SimpleToken')).deploy();
    await mockToken.deployed();

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    hAaveV3 = await (await ethers.getContractFactory('HAaveProtocolV3')).deploy();
    await hAaveV3.deployed();
    await registry.register(hAaveV3.address, asciiToHex32('HAaveProtocolV3'));

    const provider = await ethers.getContractAt('IPoolAddressesProvider', AAVEPROTOCOL_V3_PROVIDER);
    pool = await ethers.getContractAt('IPool', await provider.getPool());
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Borrow with Stable Rate', function () {
    const supplyAmount = ether('10000');
    const borrowTokenAddr = USDC_TOKEN;
    const rateMode = AAVE_RATEMODE.STABLE;
    const debtTokenAddr = AUSDC_V3_DEBT_STABLE;

    let borrowTokenUserBefore: BigNumber;
    let debtTokenUserBefore: BigNumber;
    let debtToken: IStableDebtToken;

    beforeEach(async function () {
      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      debtToken = await ethers.getContractAt('IStableDebtToken', debtTokenAddr);

      // Supply
      await token.connect(providerAddress).approve(pool.address, supplyAmount);
      await pool.connect(providerAddress).supply(token.address, supplyAmount, user.address, 0);

      borrowTokenUserBefore = await borrowToken.balanceOf(user.address);
      debtTokenUserBefore = await debtToken.balanceOf(user.address);
    });

    it('borrow token', async function () {
      const borrowAmount = mwei('1');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);
      await debtToken.connect(user).approveDelegation(proxy.address, borrowAmount);
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);
      expect(await debtToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(borrowTokenUserAfter.sub(borrowTokenUserBefore)).to.be.eq(borrowAmount);

      // borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(borrowAmount.sub(1));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(borrowAmount.add(interestMax));

      await profileGas(receipt);
    });

    it('should revert: borrow token over the collateral value', async function () {
      const borrowAmount = ether('20000');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);
      await debtToken.connect(user).approveDelegation(proxy.address, borrowAmount);

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 36' // AAVEV3 Error Code: COLLATERAL_CANNOT_COVER_NEW_BORROW
      );
    });

    it('should revert: borrow token without approveDelegation', async function () {
      const borrowAmount = mwei('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: Unspecified' // decreaseBorrowAllowance Failed
      );
    });

    it('should revert: borrow token approveDelegation < borrow amount', async function () {
      const borrowAmount = mwei('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);
      await debtToken.connect(user).approveDelegation(proxy.address, borrowAmount.sub(mwei('1')));

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: Unspecified' // decreaseBorrowAllowance Failed
      );
    });

    it('should revert: borrow token that is not in aaveV3 pool', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [COMP_TOKEN, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_borrow: Unspecified');
    });

    it('should revert: borrow token that is not enable stable mode', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [WETH_TOKEN, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 31' // AAVEV3 Error Code: STABLE_BORROWING_NOT_ENABLED
      );
    });

    it('should revert: borrow token with no collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);

      await expect(proxy.connect(someone).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 34' // AAVEV3 Error Code: COLLATERAL_BALANCE_IS_ZERO
      );
    });

    it('should revert: borrow token is the same with collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [token.address, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 37' // AAVEV3 Error Code: COLLATERAL_SAME_AS_BORROWING_CURRENCY
      );
    });
  });

  describe('Borrow with Variable Rate', function () {
    const supplyAmount = ether('10000');
    const borrowTokenAddr = WETH_TOKEN;
    const rateMode = AAVE_RATEMODE.VARIABLE;
    const debtTokenAddr = AWETH_V3_DEBT_VARIABLE;
    const debtWMATICAddr = AWMATIC_V3_DEBT_VARIABLE;

    let borrowTokenUserBefore: BigNumber;
    let borrowWMATICUserBefore: BigNumber;
    let debtTokenUserBefore: BigNumber;
    let debtWMATICUserBefore: BigNumber;
    let debtWMATIC: IVariableDebtToken;
    let debtToken: IVariableDebtToken;

    beforeEach(async function () {
      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
      debtWMATIC = await ethers.getContractAt('IVariableDebtToken', debtWMATICAddr);
      debtToken = await ethers.getContractAt('IVariableDebtToken', debtTokenAddr);

      // Supply
      await token.connect(providerAddress).approve(pool.address, supplyAmount);
      await pool.connect(providerAddress).supply(token.address, supplyAmount, user.address, 0);

      borrowTokenUserBefore = await borrowToken.balanceOf(user.address);
      borrowWMATICUserBefore = await wmatic.balanceOf(user.address);
      debtTokenUserBefore = await debtToken.balanceOf(user.address);
      debtWMATICUserBefore = await debtWMATIC.balanceOf(user.address);
    });

    it('borrow token', async function () {
      const borrowAmount = ether('1');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);
      await debtToken.connect(user).approveDelegation(proxy.address, borrowAmount);
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);
      expect(await debtToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(borrowTokenUserAfter.sub(borrowTokenUserBefore)).to.be.eq(borrowAmount);

      // borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(borrowAmount.sub(1));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(borrowAmount.add(interestMax));

      await profileGas(receipt);
    });

    it('borrow wmatic', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [WMATIC_TOKEN, borrowAmount, rateMode]);

      await debtWMATIC.connect(user).approveDelegation(proxy.address, borrowAmount);
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });
      const borrowWMATICUserAfter = await wmatic.balanceOf(user.address);
      const debtWMATICUserAfter = await debtWMATIC.balanceOf(user.address);

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);
      expect(await debtToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(borrowWMATICUserAfter.sub(borrowWMATICUserBefore)).to.be.eq(borrowAmount);

      // borrowAmount - 1 <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.gte(borrowAmount.sub(1));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.lt(borrowAmount.add(interestMax));

      await profileGas(receipt);
    });

    it('should revert: borrow token over the collateral value', async function () {
      const borrowAmount = ether('20000');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);
      await debtWMATIC.connect(user).approveDelegation(proxy.address, borrowAmount);

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 36' // AAVEV3 Error Code: COLLATERAL_CANNOT_COVER_NEW_BORROW
      );
    });

    it('should revert: borrow token without approveDelegation', async function () {
      const borrowAmount = ether('0.2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: Unspecified' // decreaseBorrowAllowance Failed
      );
    });

    it('should revert: borrow token that is not in aaveV3 pool', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [COMP_TOKEN, borrowAmount, rateMode]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: Unspecified' // Polygon version
      );
    });

    it('should revert: borrow token with no collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]);

      await expect(proxy.connect(someone).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: 34' // AAVEV3 Error Code: COLLATERAL_BALANCE_IS_ZERO
      );
    });

    it('should revert: borrow token is the same with collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV3.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [token.address, borrowAmount, rateMode]);

      await debtWMATIC.connect(user).approveDelegation(user.address, borrowAmount);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_borrow: Unspecified'
        // Variable rate doesn't check collateral and debt
      );
    });
  });
});
