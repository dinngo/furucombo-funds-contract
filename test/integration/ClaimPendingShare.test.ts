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

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import { createFund, purchaseFund, setPendingAssetFund, execSwap, redeemFund } from './fund';
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
  FUND_STATE,
  ONE_DAY,
  MINIMUM_SHARE,
  FUND_PERCENTAGE_BASE,
} from '../utils/constants';

describe('ClaimPendingShare', function () {
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
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;
  const swapAmount = purchaseAmount.div(2);
  const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;

  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;

  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, tokenA, , , , , hQuickSwap] =
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
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('success', function () {
    it('1 user after close', async function () {
      const initDenomination = await denomination.balanceOf(investor.address);
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

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

      expect(state).to.be.eq(FUND_STATE.EXECUTING);

      const swapAssetAmount = await tokenA.balanceOf(await fundProxy.vault());

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
        fundProxy,
        manager
      );

      await fundProxy.connect(manager).close();

      const beforeBalance = await denomination.balanceOf(investor.address);
      await fundProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
      expect(afterBalance).to.be.lt(initDenomination);
      expect(afterBalance).to.be.gt(beforeBalance);
    });

    // two user claim
    it('1 user after resume', async function () {
      const initDenomination = await denomination.balanceOf(investor.address);
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
      const beforeBalance = await denomination.balanceOf(investor.address);

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

      expect(state).to.be.eq(FUND_STATE.EXECUTING);

      await fundProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
      expect(afterBalance).to.be.lt(initDenomination);
      expect(afterBalance).to.be.gt(beforeBalance);
    });

    it('2 users after close', async function () {
      const initDenominationI = await denomination.balanceOf(investor.address);
      const initDenominationM = await denomination.balanceOf(manager.address);

      // investor 1
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // investor 2
      await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

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
        fundProxy,
        manager
      );

      const acceptPending = true;
      const firstRedeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
      const secondRedeemAmount = purchaseAmount;
      await redeemFund(investor, fundProxy, denomination, firstRedeemAmount, acceptPending);
      await redeemFund(manager, fundProxy, denomination, secondRedeemAmount, acceptPending);

      // investor 3
      await denomination.connect(denominationProvider).transfer(liquidator.address, initialFunds.mul(2));

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(liquidator, fundProxy, denomination, shareToken, purchaseAmount.mul(2));

      expect(state).to.be.eq(FUND_STATE.EXECUTING);

      const swapAssetAmount = await tokenA.balanceOf(await fundProxy.vault());

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
        fundProxy,
        manager
      );

      await fundProxy.connect(manager).close();

      // check investor 1
      const beforeBalance1 = await denomination.balanceOf(investor.address);
      await fundProxy.claimPendingRedemption(investor.address);
      const afterBalance1 = await denomination.balanceOf(investor.address);

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
      expect(afterBalance1).to.be.lt(initDenominationI);
      expect(afterBalance1).to.be.gt(beforeBalance1);

      // check investor 2
      const beforeBalance2 = await denomination.balanceOf(manager.address);
      await fundProxy.claimPendingRedemption(manager.address);
      const afterBalance2 = await denomination.balanceOf(manager.address);

      expect(afterBalance2).to.be.lt(initDenominationM);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });

    // two user claim
    it('2 users after resume', async function () {
      const initDenominationI = await denomination.balanceOf(investor.address);
      const initDenominationM = await denomination.balanceOf(manager.address);

      // investor 1
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // investor 2
      await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

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
        fundProxy,
        manager
      );

      const acceptPending = true;
      const firstRedeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
      const secondRedeemAmount = purchaseAmount;
      await redeemFund(investor, fundProxy, denomination, firstRedeemAmount, acceptPending);
      await redeemFund(manager, fundProxy, denomination, secondRedeemAmount, acceptPending);

      // investor 3
      await denomination.connect(denominationProvider).transfer(liquidator.address, initialFunds.mul(2));

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(liquidator, fundProxy, denomination, shareToken, purchaseAmount.mul(2));

      expect(state).to.be.eq(FUND_STATE.EXECUTING);

      // check investor 1
      const beforeBalance1 = await denomination.balanceOf(investor.address);
      await fundProxy.claimPendingRedemption(investor.address);
      const afterBalance1 = await denomination.balanceOf(investor.address);

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
      expect(afterBalance1).to.be.lt(initDenominationI);
      expect(afterBalance1).to.be.gt(beforeBalance1);

      // check investor 2
      const beforeBalance2 = await denomination.balanceOf(manager.address);
      await fundProxy.claimPendingRedemption(manager.address);
      const afterBalance2 = await denomination.balanceOf(manager.address);

      expect(afterBalance2).to.be.lt(initDenominationM);
      expect(afterBalance2).to.be.gt(beforeBalance2);
    });

    it('after resume + operation', async function () {
      const acceptPending = true;

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
      const beforeBalance = await denomination.balanceOf(investor.address);

      const [redeemShare] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

      await redeemFund(manager, fundProxy, denomination, redeemShare, acceptPending);

      await fundProxy.claimPendingRedemption(investor.address);
      const afterBalance = await denomination.balanceOf(investor.address);

      expect(afterBalance).to.be.lt(initialFunds);
      expect(afterBalance).to.be.gt(beforeBalance);
    });
  });

  describe('fail', function () {
    it('should revert: without purchase', async function () {
      await expect(fundProxy.claimPendingRedemption(investor.address)).to.be.revertedWith('RevertCode(76)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });

    it('should revert: without redeem pending', async function () {
      const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      await redeemFund(investor, fundProxy, denomination, share, acceptPending);

      await expect(fundProxy.claimPendingRedemption(investor.address)).to.be.revertedWith('RevertCode(76)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });

    it('should revert: claim twice', async function () {
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

      // purchase fund and resolve pending state
      const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

      expect(state).to.be.eq(FUND_STATE.EXECUTING);

      await fundProxy.claimPendingRedemption(investor.address);
      await expect(fundProxy.claimPendingRedemption(investor.address)).to.be.revertedWith('RevertCode(76)'); //SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
  });
});
