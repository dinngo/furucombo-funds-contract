import { Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  IERC20,
  Registry,
  IATokenV2,
  SimpleToken,
  ILendingPoolV2,
  HAaveProtocolV2,
  FurucomboProxyMock,
  IVariableDebtToken,
} from '../../typechain';

import {
  DAI_TOKEN,
  WETH_TOKEN,
  COMP_TOKEN,
  WMATIC_TOKEN,
  ADAI_V2_TOKEN,
  AAVE_RATEMODE,
  AWETH_V2_DEBT_VARIABLE,
  AWMATIC_V2_DEBT_VARIABLE,
  AAVEPROTOCOL_V2_PROVIDER,
} from './../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  getGasConsumption,
  tokenProviderQuick,
} from './../utils/utils';

describe('Aave V2 Borrow', function () {
  const aTokenAddress = ADAI_V2_TOKEN;
  const tokenAddress = DAI_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token: IERC20;
  let borrowToken: IERC20;
  let wmatic: IERC20;
  let aToken: IATokenV2;
  let mockToken: SimpleToken;
  let providerAddress: Signer;
  let debtWMATIC: IVariableDebtToken;
  let debtToken: IVariableDebtToken;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hAaveV2: HAaveProtocolV2;
  let lendingPool: ILendingPoolV2;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, someone] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      providerAddress = await tokenProviderQuick(tokenAddress);
      token = await ethers.getContractAt('IERC20', tokenAddress);
      aToken = await ethers.getContractAt('IATokenV2', aTokenAddress);
      wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
      mockToken = await (
        await ethers.getContractFactory('SimpleToken')
      ).deploy();
      await mockToken.deployed();

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hAaveV2 = await (
        await ethers.getContractFactory('HAaveProtocolV2')
      ).deploy();
      await hAaveV2.deployed();
      await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

      const provider = await ethers.getContractAt(
        'ILendingPoolAddressesProviderV2',
        AAVEPROTOCOL_V2_PROVIDER
      );

      lendingPool = await ethers.getContractAt(
        'ILendingPoolV2',
        await provider.getLendingPool()
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Borrow with Variable Rate', function () {
    const depositAmount = ether('10000');
    const borrowTokenAddr = WETH_TOKEN;
    const rateMode = AAVE_RATEMODE.VARIABLE;
    const debtTokenAddr = AWETH_V2_DEBT_VARIABLE;
    const debtWMATICAddr = AWMATIC_V2_DEBT_VARIABLE;

    let borrowTokenUserBefore: BigNumber;
    let borrowWMATICUserBefore: BigNumber;
    let debtTokenUserBefore: BigNumber;
    let debtWMATICUserBefore: BigNumber;

    beforeEach(async function () {
      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
      debtWMATIC = await ethers.getContractAt(
        'IVariableDebtToken',
        debtWMATICAddr
      );
      debtToken = await ethers.getContractAt(
        'IVariableDebtToken',
        debtTokenAddr
      );

      // Deposit
      await token
        .connect(providerAddress)
        .approve(lendingPool.address, depositAmount);

      expect(await aToken.balanceOf(user.address)).to.be.eq(0);
      await lendingPool
        .connect(providerAddress)
        .deposit(token.address, depositAmount, user.address, 0);
      expect(await aToken.balanceOf(user.address)).to.be.eq(depositAmount);

      borrowTokenUserBefore = await borrowToken.balanceOf(user.address);
      borrowWMATICUserBefore = await wmatic.balanceOf(user.address);
      debtTokenUserBefore = await debtToken.balanceOf(user.address);
      debtWMATICUserBefore = await debtWMATIC.balanceOf(user.address);
    });

    it('borrow token', async function () {
      const borrowAmount = ether('1');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        borrowToken.address,
        borrowAmount,
        rateMode,
      ]);
      await debtToken
        .connect(user)
        .approveDelegation(proxy.address, borrowAmount);
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
      expect(borrowTokenUserAfter.sub(borrowTokenUserBefore)).to.be.eq(
        borrowAmount
      );

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount
        .mul(BigNumber.from(1))
        .div(BigNumber.from(10000));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.gte(
        borrowAmount
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.lt(
        borrowAmount.add(interestMax)
      );

      profileGas(receipt);
    });

    it('borrow wmatic', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        WMATIC_TOKEN,
        borrowAmount,
        rateMode,
      ]);

      await debtWMATIC
        .connect(user)
        .approveDelegation(proxy.address, borrowAmount);
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
      expect(borrowWMATICUserAfter.sub(borrowWMATICUserBefore)).to.be.eq(
        borrowAmount
      );

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount
        .mul(BigNumber.from(1))
        .div(BigNumber.from(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.lt(
        borrowAmount.add(interestMax)
      );

      profileGas(receipt);
    });

    it('borrow matic', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrowETH(uint256,uint256)', [
        borrowAmount,
        rateMode,
      ]);
      await debtWMATIC
        .connect(user)
        .approveDelegation(proxy.address, borrowAmount);
      const balancerUserBefore = (userBalance =
        await ethers.provider.getBalance(user.address));
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      const balancerUserAfter = (userBalance = await ethers.provider.getBalance(
        user.address
      ));
      const debtWMATICUserAfter = await debtWMATIC.balanceOf(user.address);
      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await debtToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(balancerUserAfter.sub(balancerUserBefore)).to.be.eq(
        borrowAmount.sub(await getGasConsumption(receipt))
      );

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount
        .mul(BigNumber.from(1))
        .div(BigNumber.from(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.lt(
        borrowAmount.add(interestMax)
      );
      profileGas(receipt);
    });

    it('should revert: borrow token over the collateral value', async function () {
      const borrowAmount = ether('20000');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        borrowToken.address,
        borrowAmount,
        rateMode,
      ]);
      await debtWMATIC
        .connect(user)
        .approveDelegation(proxy.address, borrowAmount);

      await expect(
        proxy.connect(user).execMock(to, data, { value: ether('0.1') })
      ).to.be.revertedWith(
        'HAaveProtocolV2_borrow: 11' // AAVEV2 Error Code: VL_COLLATERAL_CANNOT_COVER_NEW_BORROW
      );
    });

    it('should revert: borrow token without approveDelegation', async function () {
      const borrowAmount = ether('0.2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        borrowToken.address,
        borrowAmount,
        rateMode,
      ]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
      );
    });

    it('should revert: borrow token that is not in aaveV2 pool', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        COMP_TOKEN,
        borrowAmount,
        rateMode,
      ]);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV2_borrow: Unspecified' // Polygon version
      );
    });

    it('should revert: borrow token with no collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        borrowToken.address,
        borrowAmount,
        rateMode,
      ]);

      await expect(
        proxy.connect(someone).execMock(to, data)
      ).to.be.revertedWith(
        'HAaveProtocolV2_borrow: 9' // AAVEV2 Error Code: VL_COLLATERAL_BALANCE_IS_0
      );
    });

    it('should revert: borrow token is the same with collateral', async function () {
      const borrowAmount = ether('2');
      const to = hAaveV2.address;
      const data = simpleEncode('borrow(address,uint256,uint256)', [
        token.address,
        borrowAmount,
        rateMode,
      ]);

      await debtWMATIC
        .connect(user)
        .approveDelegation(user.address, borrowAmount);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
        // Variable rate doesn't check collateral and debt
      );
    });
  });
});
