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

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  createFund,
  purchaseFund,
  setObservingAssetFund,
  execSwap,
  redeemFund,
} from './fund';
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
  POOL_STATE,
  ONE_DAY,
} from '../utils/constants';

describe('InvestorPurchaseFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;

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
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;
  const swapAmount = purchaseAmount.div(2);
  const redeemAmount = purchaseAmount;

  const shareTokenName = 'TEST';

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;

  let poolProxy: PoolImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;

  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(
        denominationProviderAddress
      );

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [
        poolProxy,
        ,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
        tokenA,
        ,
        ,
        ,
        ,
        hQuickSwap,
      ] = await createFund(
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
        reserveExecutionRatio,
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
  beforeEach(async function () {
    await setupTest();
  });
  describe('claim pending share', function () {
    it('1 user after close', async function () {
      const initDenomination = await denomination.balanceOf(investor.address);
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

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      expect(state).to.be.eq(POOL_STATE.EXECUTING);

      const swapAssetAmount = await tokenA.balanceOf(await poolProxy.vault());

      // swap asset back to denomination
      await execSwap(
        swapAssetAmount,
        execFeePercentage,
        tokenAAddress,
        denominationAddress,
        [tokenAAddress, denominationAddress],
        [hFunds.address, hQuickSwap.address],
        aFurucombo,
        taskExecutor,
        poolProxy,
        manager
      );

      await poolProxy.connect(manager).close();

      const beforeBalance = await denomination.balanceOf(investor.address);
      await poolProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(await poolProxy.state()).to.be.eq(POOL_STATE.CLOSED);
      expect(afterBalance).to.be.lt(initDenomination);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
    //add two user claim case
    it('1 user after resume', async function () {
      const initDenomination = await denomination.balanceOf(investor.address);
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
      const beforeBalance = await denomination.balanceOf(investor.address);

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      expect(state).to.be.eq(POOL_STATE.EXECUTING);

      await poolProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);
      expect(afterBalance).to.be.lt(initDenomination);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
    it('2 users after close', async function () {
      const initDenominationI = await denomination.balanceOf(investor.address);
      const initDenominationM = await denomination.balanceOf(manager.address);

      // investor 1
      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // investor 2
      await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // spend denomination
      await execSwap(
        purchaseAmount.mul(2),
        execFeePercentage,
        denominationAddress,
        tokenAAddress,
        [denominationAddress, tokenAAddress],
        [hFunds.address, hQuickSwap.address],
        aFurucombo,
        taskExecutor,
        poolProxy,
        manager
      );

      const acceptPending = true;
      const redeemAmount = purchaseAmount;

      await redeemFund(
        investor,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      await redeemFund(
        manager,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      // investor 3
      await denomination
        .connect(denominationProvider)
        .transfer(liquidator.address, initialFunds.mul(2));

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(
        liquidator,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount.mul(2)
      );

      expect(state).to.be.eq(POOL_STATE.EXECUTING);

      const swapAssetAmount = await tokenA.balanceOf(await poolProxy.vault());

      // swap asset back to denomination
      await execSwap(
        swapAssetAmount,
        execFeePercentage,
        tokenAAddress,
        denominationAddress,
        [tokenAAddress, denominationAddress],
        [hFunds.address, hQuickSwap.address],
        aFurucombo,
        taskExecutor,
        poolProxy,
        manager
      );

      await poolProxy.connect(manager).close();

      // check investor 1
      const beforeBalance1 = await denomination.balanceOf(investor.address);
      await poolProxy.claimPendingRedemption(investor.address);
      const afterBalance1 = await denomination.balanceOf(investor.address);

      expect(await poolProxy.state()).to.be.eq(POOL_STATE.CLOSED);
      expect(afterBalance1).to.be.lt(initDenominationI);
      expect(afterBalance1).to.be.gt(beforeBalance1);

      // check investor 2
      const beforeBalance2 = await denomination.balanceOf(manager.address);
      await poolProxy.claimPendingRedemption(manager.address);
      const afterBalance2 = await denomination.balanceOf(manager.address);

      expect(afterBalance2).to.be.lt(initDenominationM);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });
    //add two user claim case
    it('2 users after resume', async function () {
      const initDenominationI = await denomination.balanceOf(investor.address);
      const initDenominationM = await denomination.balanceOf(manager.address);

      // investor 1
      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // investor 2
      await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // spend denomination
      await execSwap(
        purchaseAmount.mul(2),
        execFeePercentage,
        denominationAddress,
        tokenAAddress,
        [denominationAddress, tokenAAddress],
        [hFunds.address, hQuickSwap.address],
        aFurucombo,
        taskExecutor,
        poolProxy,
        manager
      );

      const acceptPending = true;
      const redeemAmount = purchaseAmount;

      await redeemFund(
        investor,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      await redeemFund(
        manager,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      // investor 3
      await denomination
        .connect(denominationProvider)
        .transfer(liquidator.address, initialFunds.mul(2));

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(
        liquidator,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount.mul(2)
      );

      expect(state).to.be.eq(POOL_STATE.EXECUTING);

      // check investor 1
      const beforeBalance1 = await denomination.balanceOf(investor.address);
      await poolProxy.claimPendingRedemption(investor.address);
      const afterBalance1 = await denomination.balanceOf(investor.address);

      expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);
      expect(afterBalance1).to.be.lt(initDenominationI);
      expect(afterBalance1).to.be.gt(beforeBalance1);

      // check investor 2
      const beforeBalance2 = await denomination.balanceOf(manager.address);
      await poolProxy.claimPendingRedemption(manager.address);
      const afterBalance2 = await denomination.balanceOf(manager.address);

      expect(afterBalance2).to.be.lt(initDenominationM);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });
    // TODO: check again after pending list MR
    it.skip('after resume + operation', async function () {
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
      const beforeBalance = await denomination.balanceOf(investor.address);

      const [shareM] = await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      const bal = await poolProxy.getReserve();
      console.log('reserve');
      console.log(bal);

      const redeemShare = await poolProxy.calculateShare(purchaseAmount);
      console.log('total share:');
      console.log(shareM);
      console.log('redeem share');
      console.log(redeemShare);

      const redeemBal = await poolProxy.calculateBalance(redeemShare);
      console.log('redeem balance:');
      console.log(redeemBal);

      // TODO: check again if the state will go back to exec automatically
      await poolProxy.resume();
      expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);

      const bal1 = await poolProxy.getReserve();
      console.log('reserve');
      console.log(bal1);

      const redeemBal1 = await poolProxy.calculateBalance(redeemShare);
      console.log('redeem balance:');
      console.log(redeemBal1);

      await redeemFund(
        manager,
        poolProxy,
        denomination,
        redeemShare,
        acceptPending
      );

      await poolProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(afterBalance).to.be.lt(initialFunds);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });
  describe('should revert', function () {
    it('should revert: without purchase', async function () {
      await expect(
        poolProxy.claimPendingRedemption(investor.address)
      ).to.be.revertedWith('revertCode(77)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
    it('should revert: without redeem pending', async function () {
      const [share] = await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      await redeemFund(investor, poolProxy, denomination, share, acceptPending);

      await expect(
        poolProxy.claimPendingRedemption(investor.address)
      ).to.be.revertedWith('revertCode(77)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
    it('should revert: claim twice', async function () {
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

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(
        manager,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      expect(state).to.be.eq(POOL_STATE.EXECUTING);

      await poolProxy.claimPendingRedemption(investor.address);
      await expect(
        poolProxy.claimPendingRedemption(investor.address)
      ).to.be.revertedWith('revertCode(77)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
  });
});
