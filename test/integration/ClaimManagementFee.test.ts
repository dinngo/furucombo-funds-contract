import { Wallet, Signer } from 'ethers';
import { deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Registry,
  FurucomboProxy,
  PoolImplementation,
  IERC20,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ShareToken,
  HQuickSwap,
} from '../../typechain';

import {
  mwei,
  impersonateAndInjectEther,
  increaseNextBlockTimeBy,
} from '../utils/utils';

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
  POOL_STATE,
} from '../utils/constants';
import { setObservingAssetFund, purchaseFund } from './fund';

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
  const stakeAmount = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const reserveExecution = 0; // 0%
  const initialFunds = mwei('3000');

  const shareTokenName = 'TEST';

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;

  let poolProxy: PoolImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  const setupEachTestM0 = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments

      await _preSetup(ethers);

      const mFeeRate = 0;

      // Deploy furucombo funds contracts
      [
        poolProxy,
        ,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
      ] = [, , , , , , , , , , , , hQuickSwap] = await createFund(
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
        stakeAmount,
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        crystallizationPeriod,
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      await denomination
        .connect(denominationProvider)
        .transfer(manager.address, initialFunds);
    }
  );

  const setupEachTestM02 = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments

      await _preSetup(ethers);

      const mFeeRate = FEE_BASE * 0.02;

      // Deploy furucombo funds contracts
      [
        poolProxy,
        ,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
      ] = [, , , , , , , , , , , , hQuickSwap] = await createFund(
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
        stakeAmount,
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        crystallizationPeriod,
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      await denomination
        .connect(denominationProvider)
        .transfer(manager.address, initialFunds);
    }
  );

  const setupEachTestM99 = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments

      await _preSetup(ethers);

      const mFeeRate = FEE_BASE * 0.99;

      // Deploy furucombo funds contracts
      [
        poolProxy,
        ,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
      ] = [, , , , , , , , , , , , hQuickSwap] = await createFund(
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
        stakeAmount,
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        crystallizationPeriod,
        reserveExecution,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      await denomination
        .connect(denominationProvider)
        .transfer(manager.address, initialFunds);
    }
  );

  async function _preSetup(ethers: any) {
    [owner, collector, manager, investor, liquidator] = await (
      ethers as any
    ).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(
      denominationProviderAddress
    );

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
  }

  beforeEach(async function () {
    // await setupTest();
  });
  describe('in operation', function () {
    describe('0% management fee', function () {
      const purchaseAmount = initialFunds;
      beforeEach(async function () {
        await setupEachTestM0();
      });
      it('claim 0 fee when user redeem after purchase', async function () {
        const [share] = await purchaseFund(
          investor,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        const [balance] = await redeemFund(
          investor,
          poolProxy,
          denomination,
          share,
          accpetPending
        );
        await poolProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.eq(initialFunds);
        expect(mFee).to.be.eq(0);
      });
      it('claim 0 fee after 1 year', async function () {
        await purchaseFund(
          investor,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        await increaseNextBlockTimeBy(ONE_YEAR);
        await poolProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(mFee).to.be.eq(0);
      });
    });
    describe('2% management fee', function () {
      const purchaseAmount = initialFunds;
      beforeEach(async function () {
        await setupEachTestM02();
      });
      it('claim management fee when user redeem after purchase', async function () {
        const [share] = await purchaseFund(
          investor,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        const [balance] = await redeemFund(
          investor,
          poolProxy,
          denomination,
          share,
          accpetPending
        );
        await poolProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
      it('claim management fee when manager redeem after purchase', async function () {
        const [share] = await purchaseFund(
          manager,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        const [balance] = await redeemFund(
          manager,
          poolProxy,
          denomination,
          share,
          accpetPending
        );
        await poolProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
      it('should claim management fee after 1 year', async function () {
        const [share] = await purchaseFund(
          investor,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        await redeemFund(
          investor,
          poolProxy,
          denomination,
          share,
          accpetPending
        );
        await increaseNextBlockTimeBy(ONE_YEAR);
        await poolProxy.claimManagementFee();
        const mFee = await shareToken.balanceOf(manager.address);
        expect(mFee).to.be.gt(0);
      });
    });
    describe('99% management fee', function () {
      const purchaseAmount = initialFunds;

      beforeEach(async function () {
        await setupEachTestM99();
      });
      it('claim fee', async function () {
        const [share] = await purchaseFund(
          investor,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        const [balance] = await redeemFund(
          investor,
          poolProxy,
          denomination,
          share,
          accpetPending
        );

        const mFee = await shareToken.balanceOf(manager.address);
        expect(balance).to.be.lt(initialFunds);
        expect(mFee).to.be.gt(0);
      });
    });
  });
  describe('in observation', function () {
    //TODO: add different fee rate
    describe('2% management fee', function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;

      beforeEach(async function () {
        await setupEachTestM02();
        await setObservingAssetFund(
          manager,
          investor,
          poolProxy,
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
        await poolProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare.eq(beforeShare)).to.be.true;
      });
      it('claim fee when back to operation', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);

        // initial fund for another investor
        await denomination
          .connect(denominationProvider)
          .transfer(liquidator.address, initialFunds);

        const [, state] = await purchaseFund(
          liquidator,
          poolProxy,
          denomination,
          shareToken,
          purchaseAmount
        );
        expect(state).to.be.eq(POOL_STATE.EXECUTING);
        await poolProxy.claimManagementFee();
        const afterShare = await shareToken.balanceOf(manager.address);
        expect(afterShare.gt(beforeShare)).to.be.true;
      });
    });
  });
});
