import { Wallet, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';

import {
  FurucomboRegistry,
  FurucomboProxy,
  FundImplementationMock,
  IERC20,
  ShareToken,
  FundProxyFactory,
  HFunds,
  AFurucombo,
  TaskExecutor,
  HQuickSwap,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, increaseNextBlockTimeBy, ether } from '../utils/utils';

import { redeemFund, createMockFundInfra, setPendingAssetFund, execSwap } from './fund';
import { deployFurucomboProxyAndRegistry, createFundProxyMock } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  USDC_PROVIDER,
  FEE_BASE,
  OUTSTANDING_ACCOUNT,
  ONE_DAY,
  FUND_STATE,
  DAI_PROVIDER,
} from '../utils/constants';
import { purchaseFund } from './fund';

describe('ManagerClaimPerformanceFee', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let tokenAProvider: Signer;

  const denominationProviderAddress = USDC_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAProviderAddress = DAI_PROVIDER;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%
  const shareTokenName = 'TEST';
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;

  const outstandingAccount = OUTSTANDING_ACCOUNT;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let fundProxyFactory: FundProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementationMock;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;
  let shareToken: ShareToken;

  const setupEachTestP0 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = 0;
    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecutionRatio,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });

  const setupEachTestP1 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = FEE_BASE * 0.01;
    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecutionRatio,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });

  const setupEachTestP99 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = FEE_BASE * 0.99;
    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecutionRatio,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });
  // TODO: add connect(manager).crystallize by non-owner
  describe('in executing', function () {
    const acceptPending = false;
    describe('0% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP0();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('deduct 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows + user fully redeem', async function () {
        const pFee = await _assetValueGrowTest();

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows + user partially redeem', async function () {
        const pFee = await _assetValueGrowTestII(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.eq(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      // TODO: check again: underflow issue when run with all the test cases
      it.skip('should revert when still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(67)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });
      it('move 0 fee to outstanding address when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));

        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
    });
    describe('1% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP1();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows + user fully redeem', async function () {
        const pFee = await _assetValueGrowTest();

        expect(pFee).to.be.gt(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows + user partially redeem', async function () {
        const pFee = await _assetValueGrowTestII(purchaseAmount, acceptPending);

        expect(pFee).to.be.gt(0);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('should revert when still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(67)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });
      it('move fee to outstanding address only when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));

        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });
    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows + user fully redeem', async function () {
        const pFee = await _assetValueGrowTest();

        expect(pFee).to.be.gt(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows + user partially redeem', async function () {
        const pFee = await _assetValueGrowTestII(purchaseAmount, acceptPending);

        expect(pFee).to.be.gt(0);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('should revert when still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(67)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });
      it('move fee to outstanding address only when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));

        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });
  });
  describe('in pending', function () {
    const swapAmount = purchaseAmount.div(2);
    const redeemAmount = purchaseAmount;
    const acceptPending = true;
    // TODO: add different rate
    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
        await setPendingAssetFund(
          manager,
          investor,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount,
          swapAmount,
          redeemAmount,
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(mwei('500'), acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(mwei('300'));

        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(mwei('500'), acceptPending);

        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(initialFunds.sub(purchaseAmount), acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows + user partially redeem', async function () {
        const pFee = await _assetValueGrowTestII(initialFunds.sub(purchaseAmount), acceptPending);

        expect(pFee).to.be.gt(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });
      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(mwei('500'));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(mwei('500'));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
      it('should revert when still in crystallization period', async function () {
        await _crystallizationPeriodTest(mwei('500'), acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(67)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });
      it('move fee to outstanding address only when user purchase fund', async function () {
        await _tempAddressTest(mwei('100'));

        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });
  });

  // TODO: check again to add more cases
  describe('pending -> executing', function () {
    const swapAmount = purchaseAmount.div(2);
    const redeemAmount = purchaseAmount;
    // TODO: add different rate?
    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
        await setPendingAssetFund(
          manager,
          investor,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount,
          swapAmount,
          redeemAmount,
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );
      });
      it('unexpected denomination in vault', async function () {
        const pFee = await _unexpectedDenominationTest(mwei('300'));

        expect(pFee).to.be.gt(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
    });
  });

  async function _preCreateFundProxyMock() {
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);
    tokenAProvider = await impersonateAndInjectEther(tokenAProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxyFactory, taskExecutor, aFurucombo, hFunds, denomination, tokenA, , , , hQuickSwap] =
      await createMockFundInfra(
        owner,
        collector,
        manager,
        liquidator,
        denominationAddress,
        mortgageAddress,
        tokenAAddress,
        tokenBAddress,
        denominationAggregator,
        tokenAAggregator,
        tokenBAggregator,
        level,
        mortgageAmount,
        execFeePercentage,
        pendingExpiration,
        fRegistry,
        furucombo
      );
  }
  async function _postCreateFundProxyMock() {
    shareToken = await ethers.getContractAt('ShareToken', await fundProxy.shareToken());

    await fundProxy.connect(manager).finalize();

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  }
  async function _assetValueDeclineTest(purchaseAmount: any, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value declines -> 1500
    await fundProxy.setGrossAssetValueMock(mwei('1500'));

    await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }
  async function _assetValueDeclineTestII(purchaseAmount: any): Promise<any> {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (asset value +3000)
    // transfer asset to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await tokenA.connect(tokenAProvider).transfer(vaultAddr, ether('3000'));
    await fundProxy.connect(manager).addAsset(tokenAAddress);

    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value declines (asset value -> 1500)
    await fundProxy.setGrossAssetValueMock(mwei('1500'));

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }

  async function _unexpectedDenominationTest(purchaseAmount: any): Promise<any> {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (asset value +3000)
    // transfer asset to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, mwei('3000'));

    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    await execSwap(
      mwei('1500'),
      execFeePercentage,
      denomination.address,
      tokenA.address,
      [denomination.address, tokenA.address],
      [hFunds.address, hQuickSwap.address],
      aFurucombo,
      taskExecutor,
      fundProxy,
      manager
    );

    // asset value -> 1500
    await fundProxy.setGrossAssetValueMock(mwei('1500'));

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }

  async function _assetValueNotChangedTest(purchaseAmount: any, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // claim pFee
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const pFee = await shareToken.balanceOf(manager.address);

    return pFee;
  }
  async function _assetValueNotChangedTestII(purchaseAmount: any, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value declines (price: 3000 -> 1500)
    await fundProxy.setGrossAssetValueMock(1500);

    await redeemFund(investor, fundProxy, denomination, share * 0.5, acceptPending);

    // asset value grows back (price: 750 -> 1500)
    await fundProxy.setGrossAssetValueMock(1500);

    await redeemFund(investor, fundProxy, denomination, share * 0.5, acceptPending);

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }
  async function _assetValueGrowTest(): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    await redeemFund(investor, fundProxy, denomination, share * 0.5, acceptPending);

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }
  async function _assetValueGrowTestII(purchaseAmount: any, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows -> 6000
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    await redeemFund(investor, fundProxy, denomination, share * 0.5, acceptPending);

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }
  async function _assetValueHighWaterMarkTest(purchaseAmount: any) {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (price: 1500 -> 4500)
    // transfer denomination to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, initialFunds);

    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const share1 = await shareToken.balanceOf(manager.address);

    // asset value grows (price: 4500 -> 1000)
    await fundProxy.setGrossAssetValueMock(mwei('1000'));

    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const share2 = await shareToken.balanceOf(manager.address);
    expect(share2).to.be.eq(share1);

    // asset value grows (price: 1000 -> 3000)
    await fundProxy.setGrossAssetValueMock(mwei('3000'));

    // claim pFee
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const share3 = await shareToken.balanceOf(manager.address);

    expect(share3).to.be.eq(share2);
  }
  async function _assetValueHighWaterMarkTestII(purchaseAmount: any): Promise<any> {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (price: 1500 -> 4500)
    // transfer denomination to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, initialFunds);

    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const share1 = await shareToken.balanceOf(manager.address);

    // asset value grows (price: 4500 -> 1000)
    await fundProxy.setGrossAssetValueMock(mwei('1000'));

    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const beforeGrowShare = await shareToken.balanceOf(manager.address);
    expect(beforeGrowShare).to.be.eq(share1);

    // asset value grows (price: 1000 -> 6000)
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    // claim pFee
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterGrowShare = await shareToken.balanceOf(manager.address);

    return [beforeGrowShare, afterGrowShare];
  }
  async function _crystallizationPeriodTest(purchaseAmount: any, acceptPending: any) {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    // trigger _updatePerformance
    await redeemFund(investor, fundProxy, denomination, share * 0.5, acceptPending);
  }
  async function _tempAddressTest(purchaseAmount: any) {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows -> 6000
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  }
});
