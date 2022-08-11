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
} from '../../typechain';

import {
  DAI_TOKEN,
  USDC_TOKEN,
  WMATIC_TOKEN,
  ADAI_V3_TOKEN,
  AAVE_RATEMODE,
  AUSDC_V3_DEBT_STABLE,
  AWMATIC_V3_DEBT_VARIABLE,
  AAVEPROTOCOL_V3_PROVIDER,
} from '../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  tokenProviderQuick,
  expectEqWithinBps,
  getHandlerReturn,
  balanceDelta,
  mwei,
} from '../utils/utils';

describe('Aave V3 Repay', function () {
  const aTokenAddress = ADAI_V3_TOKEN;
  const tokenAddress = DAI_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token: IERC20;
  let borrowToken: IERC20;
  let aToken: IATokenV3;
  let mockToken: SimpleToken;
  let providerAddress: Signer;
  let debtToken: IERC20;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hAaveV3: HAaveProtocolV3;
  let pool: IPool;

  let userBalance: BigNumber;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    providerAddress = await tokenProviderQuick(tokenAddress);
    token = await ethers.getContractAt('IERC20', tokenAddress);
    aToken = await ethers.getContractAt('IATokenV3', aTokenAddress);
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

  describe('Repay Variable Rate', function () {
    let supplyAmount = ether('10000');
    const borrowAmount = mwei('2');
    const borrowTokenAddr = USDC_TOKEN;
    const rateMode = AAVE_RATEMODE.STABLE;
    const debtTokenAddr = AUSDC_V3_DEBT_STABLE;

    let borrowTokenProvider: Signer;
    let borrowTokenUserBefore: BigNumber;
    let debtTokenUserBefore: BigNumber;

    beforeEach(async function () {
      borrowTokenProvider = await tokenProviderQuick(borrowTokenAddr);
      token = await ethers.getContractAt('IERC20', tokenAddress);
      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      debtToken = await ethers.getContractAt('IERC20', debtTokenAddr);

      // Supply
      await token.connect(providerAddress).approve(pool.address, supplyAmount);
      await pool.connect(providerAddress).supply(token.address, supplyAmount, user.address, 0);

      // Borrow
      await pool.connect(user).borrow(borrowToken.address, borrowAmount, rateMode, 0, user.address);

      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
      expectEqWithinBps(await debtToken.balanceOf(user.address), borrowAmount, 100);

      borrowTokenUserBefore = await borrowToken.balanceOf(user.address);
      debtTokenUserBefore = await debtToken.balanceOf(user.address);
    });

    it('partial', async function () {
      const repayAmount = borrowAmount.div(BigNumber.from('2'));
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, repayAmount, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, repayAmount);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      // (debtAmountBefore - repayAmount -1) <= remainDebtAmount < (debtAmountBefore - repayAmount + interestMax)
      // NOTE: handlerReturn == (debtAmountBefore - repayAmount -1) (sometime, Ganache bug maybe)
      expect(handlerReturn).to.be.gte(debtTokenUserBefore.sub(repayAmount.add(BigNumber.from(1))));
      expect(handlerReturn).to.be.lt(debtTokenUserBefore.sub(repayAmount).add(interestMax));

      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      // (repayAmount - interestMax) < (debtTokenUserBefore - debtTokenUserAfter) <= repayAmount
      expect(debtTokenUserBefore.sub(debtTokenUserAfter)).to.be.gt(repayAmount.sub(interestMax));
      expect(debtTokenUserBefore.sub(debtTokenUserAfter)).to.be.lte(borrowAmount);
      expect(borrowTokenUserBefore.sub(borrowTokenUserAfter)).to.be.eq(repayAmount);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('whole', async function () {
      const extraNeed = mwei('1');
      const repayAmount = borrowAmount.add(extraNeed);
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, repayAmount, rateMode]);
      await borrowToken.connect(borrowTokenProvider).transfer(user.address, extraNeed);
      await borrowToken.connect(user).transfer(proxy.address, repayAmount);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      expect(handlerReturn).to.be.eq(0);

      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(debtTokenUserAfter).to.be.eq(0);

      // (extraNeed - interestMax) < borrowTokenUserAfter <= extraNeed
      expect(borrowTokenUserAfter).to.be.gt(extraNeed.sub(interestMax));
      expect(borrowTokenUserAfter).to.be.lte(extraNeed);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('should revert: not enough balance', async function () {
      const value = mwei('0.5');
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value.sub(mwei('0.1')));
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_repay: ERC20: transfer amount exceeds balance'
      );
    });

    it('should revert: not supported token', async function () {
      const value = ether('0.5');
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [mockToken.address, value, rateMode]);
      await mockToken.connect(owner).transfer(proxy.address, value);
      await proxy.updateTokenMock(mockToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_repay: Unspecified');
    });

    it('should revert: wrong rate mode', async function () {
      const value = mwei('0.5');
      const to = hAaveV3.address;
      const unborrowedRateMode = (rateMode % 2) + 1;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, unborrowedRateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value);
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_repay: 39'); // AAVEV3 Error Code: NO_DEBT_OF_SELECTED_TYPE
    });
  });

  describe('Repay Variable Rate', function () {
    let supplyAmount = ether('10000');
    const borrowAmount = ether('2');
    const borrowTokenAddr = WMATIC_TOKEN;
    const rateMode = AAVE_RATEMODE.VARIABLE;
    const debtTokenAddr = AWMATIC_V3_DEBT_VARIABLE;

    let borrowTokenProvider: Signer;
    let borrowTokenUserBefore: BigNumber;
    let debtTokenUserBefore: BigNumber;

    beforeEach(async function () {
      borrowTokenProvider = await tokenProviderQuick(borrowTokenAddr);
      token = await ethers.getContractAt('IERC20', tokenAddress);

      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      debtToken = await ethers.getContractAt('IERC20', debtTokenAddr);

      // Supply
      await token.connect(providerAddress).approve(pool.address, supplyAmount);
      await pool.connect(providerAddress).supply(token.address, supplyAmount, user.address, 0);
      supplyAmount = await aToken.balanceOf(user.address);

      // Borrow
      await pool.connect(user).borrow(borrowToken.address, borrowAmount, rateMode, 0, user.address);

      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
      expectEqWithinBps(await debtToken.balanceOf(user.address), borrowAmount, 100);

      borrowTokenUserBefore = await borrowToken.balanceOf(user.address);
      debtTokenUserBefore = await debtToken.balanceOf(user.address);
    });

    it('partial', async function () {
      const repayAmount = borrowAmount.div(BigNumber.from('2'));
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, repayAmount, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, repayAmount);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      // const debtTokenUserBefore = await debtToken.balanceOf(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      // (debtAmountBefore - repayAmount -1) <= remainDebtAmount < (debtAmountBefore - repayAmount + interestMax)
      // NOTE: handlerReturn == (debtAmountBefore - repayAmount -1) (sometime, Ganache bug maybe)
      expect(handlerReturn).to.be.gte(debtTokenUserBefore.sub(repayAmount.add(BigNumber.from(1))));
      expect(handlerReturn).to.be.lt(debtTokenUserBefore.sub(repayAmount).add(interestMax));

      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      // (repayAmount - interestMax) < (debtTokenUserBefore - debtTokenUserAfter) <= repayAmount
      expect(debtTokenUserBefore.sub(debtTokenUserAfter)).to.be.gt(repayAmount.sub(interestMax));
      expect(debtTokenUserBefore.sub(debtTokenUserAfter)).to.be.lte(borrowAmount);
      expect(borrowTokenUserBefore.sub(borrowTokenUserAfter)).to.be.eq(repayAmount);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('whole', async function () {
      const extraNeed = ether('1');
      const repayAmount = borrowAmount.add(extraNeed);
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, repayAmount, rateMode]);
      await borrowToken.connect(borrowTokenProvider).transfer(user.address, extraNeed);
      await borrowToken.connect(user).transfer(proxy.address, repayAmount);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      expect(handlerReturn).to.be.eq(0);

      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      expect(debtTokenUserAfter).to.be.eq(0);

      // (extraNeed - interestMax) < borrowTokenUserAfter <= extraNeed
      expect(borrowTokenUserAfter).to.be.gt(extraNeed.sub(interestMax));
      expect(borrowTokenUserAfter).to.be.lte(extraNeed);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('should revert: not enough balance', async function () {
      const value = ether('0.5');
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value.sub(ether('0.1')));
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_repay: Unspecified');
    });

    it('should revert: not supported token', async function () {
      const value = ether('0.5');
      const to = hAaveV3.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [mockToken.address, value, rateMode]);
      await mockToken.connect(owner).transfer(proxy.address, value);
      await proxy.updateTokenMock(mockToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_repay: Unspecified');
    });

    it('should revert: wrong rate mode', async function () {
      const value = ether('0.5');
      const to = hAaveV3.address;
      const unborrowedRateMode = (rateMode % 2) + 1;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, unborrowedRateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value);
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_repay: 39'); // AAVEV3 Error Code: NO_DEBT_OF_SELECTED_TYPE
    });
  });
});
