import { Wallet, Signer, BigNumber } from 'ethers';
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

import {
  createFund,
  redeemFund,
  purchaseFund,
  setExecutingDenominationFund,
  setExecutingAssetFund,
  setPendingAssetFund,
  setClosedDenominationFund,
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
  FUND_STATE,
  ONE_DAY,
  MINIMUM_SHARE,
  FUND_PERCENTAGE_BASE,
} from '../utils/constants';

describe('InvestorRedeemFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let user0: Wallet, user1: Wallet, user2: Wallet, user3: Wallet, user4: Wallet;

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

  const initialFunds = mwei('6000');
  const purchaseAmount = mwei('4000');
  const swapAmount = initialFunds.div(2);

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementation;
  let fundVault: string;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, user0, user1, user2, user3, user4, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxy, fundVault, denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , , , , hQuickSwap] =
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

    // Transfer token to users
    await denomination.connect(denominationProvider).transfer(user0.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user1.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user2.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user3.address, initialFunds);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Without state change', function () {
    describe('Executing state', function () {
      const acceptPending = false;
      let eachUserShares: BigNumber, eachUserSharesDouble: BigNumber;
      let totalShare: BigNumber;
      beforeEach(async function () {
        const [user0Share] = await purchaseFund(user0, fundProxy, denomination, shareToken, initialFunds);
        totalShare = user0Share;
        eachUserShares = totalShare.div(6);
        eachUserSharesDouble = eachUserShares.mul(2);
        await shareToken.connect(user0).transfer(user1.address, eachUserShares);
        await shareToken.connect(user0).transfer(user2.address, eachUserShares);
        await shareToken.connect(user0).transfer(user3.address, eachUserSharesDouble);

        const user1Share = await shareToken.balanceOf(user1.address);
      });

      it('user1 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);

        const [user1RedeemAmount, user1State] = await redeemFund(
          user1,
          fundProxy,
          denomination,
          eachUserShares,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);

        const user1Share = await shareToken.balanceOf(user1.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user1Share).to.be.eq(0);
        expect(user1State).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1 and user2 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount, user2State] = await redeemFund(
          user2,
          fundProxy,
          denomination,
          eachUserShares,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore.add(user2RedeemAmount));
        expect(user1RedeemAmount).to.be.eq(user2RedeemAmount);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user2State).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1, user2 and user3 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const user3BalanceBefore = await denomination.balanceOf(user3.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount] = await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);

        const [user3RedeemAmount, user3State] = await redeemFund(
          user3,
          fundProxy,
          denomination,
          eachUserSharesDouble,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);
        const user3BalanceAfter = await denomination.balanceOf(user3.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        const user3Share = await shareToken.balanceOf(user3.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore.add(user2RedeemAmount));
        expect(user3BalanceAfter).to.be.eq(user3BalanceBefore.add(user3RedeemAmount));
        expect(user1RedeemAmount).to.be.eq(user2RedeemAmount);
        expect(user3RedeemAmount).to.be.eq(user1RedeemAmount.mul(2));
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user3Share).to.be.eq(0);
        expect(user3State).to.be.eq(FUND_STATE.EXECUTING);
      });
    }); // describe('Executing state') end

    describe('Pending state', function () {
      const acceptPending = true;
      let eachUserShares: BigNumber, eachUserSharesDouble: BigNumber;

      beforeEach(async function () {
        const swapAmount = mwei('3000');
        const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('1500'));

        // makes fund pending
        await setPendingAssetFund(
          manager,
          user0,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount,
          swapAmount,
          redeemAmount,
          execFeePercentage,
          denominationAddress,
          tokenBAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );

        const user0Share = await shareToken.balanceOf(user0.address);
        eachUserShares = user0Share.div(6);
        eachUserSharesDouble = eachUserShares.mul(2);
        await shareToken.connect(user0).transfer(user1.address, eachUserShares);
        await shareToken.connect(user0).transfer(user2.address, eachUserShares);
        await shareToken.connect(user0).transfer(user3.address, eachUserSharesDouble);
      });

      it('user1 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);
        const user1Share = await shareToken.balanceOf(user1.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore);
        expect(user1Share).to.be.eq(0);
        expect(fundShareTokenAfter.sub(fundShareTokenBefore)).to.be.eq(eachUserShares);
      });

      it('user1 and user2 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);
        await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);

        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore);
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(fundShareTokenAfter.sub(fundShareTokenBefore)).to.be.eq(eachUserShares.mul(2));
      });

      it('user1, user2 and user3 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const user3BalanceBefore = await denomination.balanceOf(user3.address);
        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);
        await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);
        await redeemFund(user3, fundProxy, denomination, eachUserSharesDouble, acceptPending);

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);
        const user3BalanceAfter = await denomination.balanceOf(user3.address);

        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        const user3Share = await shareToken.balanceOf(user3.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore);
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore);
        expect(user3BalanceAfter).to.be.eq(user3BalanceBefore);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user3Share).to.be.eq(0);
        expect(fundShareTokenAfter.sub(fundShareTokenBefore)).to.be.eq(eachUserShares.mul(4));
      });
    }); // describe('Executing state') end
  }); // describe('Without state change') end

  describe('State change', function () {
    describe('Executing state', function () {}); // describe('Executing state') end
  }); // describe('Without state change') end

  describe('Claimable pending', function () {
    const acceptPending = false;

    it('user1 has claimable pending, user1 redeem', async function () {
      const purchaseAmount = mwei('4000');
      const swapAmount = mwei('3000');
      const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('1000'));

      // makes fund pending
      await setPendingAssetFund(
        manager,
        user1,
        fundProxy,
        denomination,
        shareToken,
        purchaseAmount,
        swapAmount,
        redeemAmount,
        execFeePercentage,
        denominationAddress,
        tokenBAddress,
        hFunds,
        aFurucombo,
        taskExecutor,
        hQuickSwap
      );

      // purchase to make to executing
      const [, user2State] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
      expect(user2State).to.be.eq(FUND_STATE.EXECUTING);

      // check user1 pending redemption is claimable or not
      const claimable = await fundProxy.isPendingRedemptionClaimable(user1.address);
      expect(claimable).to.be.true;

      // user1 redeem
      const user1ShareBefore = await shareToken.balanceOf(user1.address);
      const expectedRedeemBalance = await fundProxy.calculateBalance(user1ShareBefore);
      const user1BalanceBefore = await denomination.balanceOf(user1.address);

      const redeemTx = await fundProxy.connect(user1).redeem(user1ShareBefore, true);

      const user1BalanceAfter = await denomination.balanceOf(user1.address);
      const user1ShareAfter = await shareToken.balanceOf(user1.address);
      const state = await fundProxy.state();

      expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.gt(expectedRedeemBalance);
      expect(redeemTx).to.emit(fundProxy, 'RedemptionClaimed').withArgs(user1.address);
      expect(state).to.be.eq(FUND_STATE.EXECUTING);
      expect(user1ShareAfter).to.be.eq(0);
    });
  });

  describe('Dead oracle', function () {});
});
