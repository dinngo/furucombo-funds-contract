import { Wallet, Signer } from 'ethers';
import { deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Chainlink,
  FurucomboRegistry,
  FurucomboProxy,
  FundImplementation,
  IERC20,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ShareToken,
  HQuickSwap,
} from '../../typechain';

import { expectEqWithinBps, mwei, impersonateAndInjectEther, increaseNextBlockTimeBy } from '../utils/utils';

import { createFund, redeemFund, setLiquidatingAssetFund, setClosedDenominationFund } from './fund';
import { deployFurucomboProxyAndRegistry } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  USDC_PROVIDER,
  FUND_PERCENTAGE_BASE,
  ONE_YEAR,
  ONE_DAY,
  FUND_STATE,
  MINIMUM_SHARE,
} from '../utils/constants';
import { setPendingAssetFund, purchaseFund } from './fund';

describe('ManagerClaimManagementFee', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;

  const accpetPending = false;

  const denominationProviderAddress = USDC_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const initialFunds = mwei('3000');

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let oracle: Chainlink;

  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  const setupEachTestM0 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = 0;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , oracle, , , hQuickSwap, ,] =
      await createFund(
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
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        crystallizationPeriod,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    await oracle.connect(owner).setStalePeriod(ONE_YEAR * 2);
  });

  const setupEachTestM01 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = FUND_PERCENTAGE_BASE * 0.01;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , oracle, , , hQuickSwap, ,] =
      await createFund(
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
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        crystallizationPeriod,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    await oracle.connect(owner).setStalePeriod(ONE_YEAR * 2);
  });

  const setupEachTestM99 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = FUND_PERCENTAGE_BASE * 0.99;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , oracle, , , hQuickSwap, ,] =
      await createFund(
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
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        crystallizationPeriod,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    await oracle.connect(owner).setStalePeriod(ONE_YEAR * 2);
  });

  async function _preSetup(ethers: any) {
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
  }

  async function _claimNoFeeTest() {
    // Get before states
    const beforeShare = await shareToken.balanceOf(manager.address);
    const beforeLastClaimTime = await fundProxy.lastMFeeClaimTime();

    // Claim mgmt fee
    await increaseNextBlockTimeBy(ONE_YEAR);
    await fundProxy.claimManagementFee();

    // Verify states
    const afterLastClaimTime = await fundProxy.lastMFeeClaimTime();
    const afterShare = await shareToken.balanceOf(manager.address);
    expect(afterShare).eq(beforeShare);
    expect(afterLastClaimTime).to.be.eq(beforeLastClaimTime);
  }

  describe('in executing', function () {
    describe('0% management fee', function () {
      const purchaseAmount = initialFunds;

      beforeEach(async function () {
        await setupEachTestM0();
      });

      it('claim 0 fee when user redeem after purchase', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        const [balance] = await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        await fundProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.eq(initialFunds.sub(MINIMUM_SHARE));
        expect(mFee).to.be.eq(0);
      });

      it('claim 0 fee after 1 year', async function () {
        await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        await increaseNextBlockTimeBy(ONE_YEAR);
        await fundProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(mFee).to.be.eq(0);
      });
    });

    describe('1% management fee', function () {
      const purchaseAmount = initialFunds;
      const feeRate = FUND_PERCENTAGE_BASE * 0.01;

      beforeEach(async function () {
        await setupEachTestM01();
      });

      it('claim management fee when user redeem after purchase', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        // Management fee settlement is processed when redeeming
        const [balance] = await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });

      it('claim management fee when manager redeem after purchase', async function () {
        const [share] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        // Management fee settlement is processed when redeeming
        const [balance] = await redeemFund(manager, fundProxy, denomination, share, accpetPending);
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });

      it('claim management fee after 1 year', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        const expectAmount = share
          .mul(FUND_PERCENTAGE_BASE)
          .div(FUND_PERCENTAGE_BASE - feeRate)
          .sub(share);
        await increaseNextBlockTimeBy(ONE_YEAR);
        // Management fee settlement is processed when redeeming
        await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        const mFee = await shareToken.balanceOf(manager.address);
        expectEqWithinBps(mFee, expectAmount, 1);
      });
    });

    describe('99% management fee', function () {
      const purchaseAmount = initialFunds;

      beforeEach(async function () {
        await setupEachTestM99();
      });

      it('claim fee', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        // Management fee settlement is processed when redeeming
        const [balance] = await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
    });
  });

  describe('in pending', function () {
    describe('1% management fee', function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

      beforeEach(async function () {
        await setupEachTestM01();
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

      it('claim no fee', async function () {
        // Get before states
        const beforeShare = await shareToken.balanceOf(manager.address);
        const beforeLastClaimTime = await fundProxy.lastMFeeClaimTime();

        // Claim mgmt fee
        await increaseNextBlockTimeBy(ONE_YEAR);
        await fundProxy.claimManagementFee();

        // Verify states
        const afterLastClaimTime = await fundProxy.lastMFeeClaimTime();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare).eq(beforeShare);
        expect(afterLastClaimTime).to.be.gt(beforeLastClaimTime);
      });

      it('claim fee when back to executing', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);

        // initial fund for another investor
        await denomination.connect(denominationProvider).transfer(liquidator.address, initialFunds);

        const [, state] = await purchaseFund(liquidator, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        await fundProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare).gt(beforeShare);
      });
    });

    describe('99% management fee', function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

      beforeEach(async function () {
        await setupEachTestM99();
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

      it('claim fee when back to executing', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);

        // initial fund for another investor
        await denomination.connect(denominationProvider).transfer(liquidator.address, initialFunds);

        const [, state] = await purchaseFund(liquidator, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        await fundProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare).gt(beforeShare);
      });
    });
  });

  describe('in liquidating', function () {
    describe('99% management fee', function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

      beforeEach(async function () {
        await setupEachTestM99();
        await setLiquidatingAssetFund(
          manager,
          investor,
          liquidator,
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
          oracle,
          hQuickSwap,
          pendingExpiration
        );
      });

      it('claim no fee', async function () {
        _claimNoFeeTest();
      });
    });
  });

  describe('in closed', function () {
    describe('99% management fee', function () {
      const purchaseAmount = initialFunds;

      beforeEach(async function () {
        await setupEachTestM99();
        await setClosedDenominationFund(manager, investor, fundProxy, denomination, shareToken, purchaseAmount);
      });

      it('claim no fee', async function () {
        _claimNoFeeTest();
      });
    });
  });
});
