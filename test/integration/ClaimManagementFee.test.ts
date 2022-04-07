import { Wallet, Signer } from 'ethers';
import { deployments } from 'hardhat';
import { expect } from 'chai';

import {
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

import { createFund, redeemFund } from './fund';
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
  FEE_BASE,
  ONE_YEAR,
  ONE_DAY,
  FUND_STATE,
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
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const reserveExecution = 0;
  const initialFunds = mwei('3000');

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;

  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  const setupEachTestM0 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = 0;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds] = [, , , , , , , , , , , , hQuickSwap] =
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
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investors
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });

  const setupEachTestM02 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = FEE_BASE * 0.02;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds] = [, , , , , , , , , , , , hQuickSwap] =
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
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });

  const setupEachTestM99 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preSetup(ethers);

    const mFeeRate = FEE_BASE * 0.99;

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds] = [, , , , , , , , , , , , hQuickSwap] =
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
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });

  async function _preSetup(ethers: any) {
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
  }

  beforeEach(async function () {
    // await setupTest();
  });
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
        expect(balance).to.be.eq(initialFunds);
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
    describe('2% management fee', function () {
      const purchaseAmount = initialFunds;
      const feeRate = FEE_BASE * 0.02;
      beforeEach(async function () {
        await setupEachTestM02();
      });
      it('claim management fee when user redeem after purchase', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        const [balance] = await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        // Management fee settlement is processed when redeeming
        // await fundProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
      it('claim management fee when manager redeem after purchase', async function () {
        const [share] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        const [balance] = await redeemFund(manager, fundProxy, denomination, share, accpetPending);
        // Management fee settlement is processed when redeeming
        // await fundProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
      it('should claim management fee after 1 year', async function () {
        const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        const expectAmount = share
          .mul(FEE_BASE)
          .div(FEE_BASE - feeRate)
          .sub(share);
        await increaseNextBlockTimeBy(ONE_YEAR);
        await redeemFund(investor, fundProxy, denomination, share, accpetPending);
        // Management fee settlement is processed when redeeming
        // await fundProxy.claimManagementFee();
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
        const [balance] = await redeemFund(investor, fundProxy, denomination, share, accpetPending);

        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
    });
  });
  describe('in pending', function () {
    //TODO: add different fee rate
    describe('2% management fee', function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;

      beforeEach(async function () {
        await setupEachTestM02();
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
        const beforeShare = await shareToken.balanceOf(manager.address);
        await increaseNextBlockTimeBy(ONE_YEAR);
        await fundProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare.eq(beforeShare)).to.be.true;
      });
      it('claim fee when back to executing', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);

        // initial fund for another investor
        await denomination.connect(denominationProvider).transfer(liquidator.address, initialFunds);

        const [, state] = await purchaseFund(liquidator, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        await fundProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare.gt(beforeShare)).to.be.true;
      });
    });
  });
});
