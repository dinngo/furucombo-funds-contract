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
  Chainlink,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, increaseNextBlockTimeBy } from '../utils/utils';

import {
  createFund,
  redeemFund,
  purchaseFund,
  setExecutingAssetFund,
  setPendingAssetFund,
  setLiquidatingAssetFund,
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
  FUND_PERCENTAGE_BASE,
} from '../utils/constants';

describe('InvestorRedeemFund', function () {
  let oracle: Chainlink;
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
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

  const initialFunds = mwei('6000');
  const purchaseAmount = mwei('4000');
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
    [fundProxy, fundVault, denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , oracle, , , hQuickSwap, ,] =
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
      });

      it('user1 redeem all share', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        const [user1RedeemAmount, fundState] = await redeemFund(
          user1,
          fundProxy,
          denomination,
          eachUserShares,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        const user1Share = await shareToken.balanceOf(user1.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(vaultBalanceBefore.sub(vaultBalanceAfter)).to.be.eq(user1RedeemAmount);
        expect(user1Share).to.be.eq(0);
        expect(fundState).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1 and user2 redeem all share, they should get the same redeem amount', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount, fundState] = await redeemFund(
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
        expect(fundState).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1, user2 and user3 redeem all share, user3 redeem amount should be twice the user1 redeem amount', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const user3BalanceBefore = await denomination.balanceOf(user3.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount] = await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);

        const [user3RedeemAmount, fundState] = await redeemFund(
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
        expect(fundState).to.be.eq(FUND_STATE.EXECUTING);
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

      it('should revert: user1 redeem with not accepting pending', async function () {
        await expect(fundProxy.connect(user1).redeem(eachUserShares, false)).to.be.revertedWith('RevertCode(74)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
      });

      it('user1 redeem and doesnt get any money, fund share token increase', async function () {
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

      it('user1 and user2 redeem and dont get any money, fund share token increase', async function () {
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

      it('user1, user2 and user3 redeem and dont get any money, fund share token increase', async function () {
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
    }); // describe('Pending state') end

    describe('Close state', function () {
      const acceptPending = true;
      let eachUserShares: BigNumber, eachUserSharesDouble: BigNumber;
      let totalShare: BigNumber;

      beforeEach(async function () {
        await setClosedDenominationFund(manager, user0, fundProxy, denomination, shareToken, purchaseAmount);

        totalShare = await shareToken.balanceOf(user0.address);
        eachUserShares = totalShare.div(4);
        eachUserSharesDouble = eachUserShares.mul(2);
        await shareToken.connect(user0).transfer(user1.address, eachUserShares);
        await shareToken.connect(user0).transfer(user2.address, eachUserShares);
        await shareToken.connect(user0).transfer(user3.address, eachUserSharesDouble);
      });

      it('user1 redeem all share', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);

        const [user1RedeemAmount, fundState] = await redeemFund(
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
        expect(fundState).to.be.eq(FUND_STATE.CLOSED);
      });

      it('user1 and user2 redeem all share, they should get the same redeem amount', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount, fundState] = await redeemFund(
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
        expect(fundState).to.be.eq(FUND_STATE.CLOSED);
      });

      it('user1, user2 and user3 redeem all share, user3 redeem amount should be twice the user1 redeem amount', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const user3BalanceBefore = await denomination.balanceOf(user3.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount] = await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);

        const [user3RedeemAmount, fundState] = await redeemFund(
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
        expect(fundState).to.be.eq(FUND_STATE.CLOSED);
      });
    }); // describe('Close state') end
  }); // describe('Without state change') end

  describe('State change', function () {
    describe('Executing --> Pending', function () {
      const acceptPending = true;
      const swapAmount = initialFunds.div(2);
      let totalShare: BigNumber;
      beforeEach(async function () {
        await setExecutingAssetFund(
          manager,
          user0,
          fundProxy,
          denomination,
          shareToken,
          initialFunds,
          swapAmount,
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );
        totalShare = await shareToken.balanceOf(user0.address);
      });

      it('should revert: user0 redeem with not accepting pending', async function () {
        await expect(fundProxy.connect(user0).redeem(totalShare, false)).to.be.revertedWith('RevertCode(74)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
      });

      it('user1 redeem and get partial money, fund goes to pending', async function () {
        // user1 redeem all shares
        await shareToken.connect(user0).transfer(user1.address, totalShare);

        const expectedRedeemBalance = await fundProxy.calculateBalance(totalShare);
        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        const [user1Balance, fundState] = await redeemFund(user1, fundProxy, denomination, totalShare, acceptPending);

        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);
        const user1Share = await shareToken.balanceOf(user1.address);

        expect(expectedRedeemBalance).to.be.gt(user1Balance);
        expect(fundShareTokenAfter).to.be.gt(fundShareTokenBefore);
        expect(user1Share).to.be.eq(0);
        expect(fundState).to.be.eq(FUND_STATE.PENDING);
      });

      it('user1 and user2 redeem. user2 get partial money, fund goes to pending', async function () {
        // user1 redeem, fund still in executing. user2 redeem led to fund go to pending.
        const user1RedeemShare = swapAmount.div(2);
        const user2RedeemShare = swapAmount;
        await shareToken.connect(user0).transfer(user1.address, user1RedeemShare);
        await shareToken.connect(user0).transfer(user2.address, user2RedeemShare);

        const user1ExpectedRedeemBalance = await fundProxy.calculateBalance(user1RedeemShare);
        const user2ExpectedRedeemBalance = await fundProxy.calculateBalance(user2RedeemShare);

        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        const [user1Balance, fundState1] = await redeemFund(user1, fundProxy, denomination, user1RedeemShare, false);
        const [user2Balance, fundState2] = await redeemFund(
          user2,
          fundProxy,
          denomination,
          user2RedeemShare,
          acceptPending
        );

        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);
        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);

        expect(user1ExpectedRedeemBalance).to.be.eq(user1Balance);
        expect(user2ExpectedRedeemBalance).to.be.gt(user2Balance);
        expect(fundShareTokenAfter).to.be.gt(fundShareTokenBefore);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(fundState1).to.be.eq(FUND_STATE.EXECUTING);
        expect(fundState2).to.be.eq(FUND_STATE.PENDING);
      });

      it('user1, user2 and user3 redeem. user3 get partial money, fund goes to pending', async function () {
        // user1 and user2 redeem, fund still in executing. user3 redeem led to fund go to pending.
        const user1RedeemShare = swapAmount.div(3);
        const user2RedeemShare = user1RedeemShare;
        const user3RedeemShare = swapAmount;
        await shareToken.connect(user0).transfer(user1.address, user1RedeemShare);
        await shareToken.connect(user0).transfer(user2.address, user2RedeemShare);
        await shareToken.connect(user0).transfer(user3.address, user3RedeemShare);

        const user1And2ExpectedRedeemBalance = await fundProxy.calculateBalance(user1RedeemShare);
        const user3ExpectedRedeemBalance = await fundProxy.calculateBalance(user3RedeemShare);

        const fundShareTokenBefore = await shareToken.balanceOf(fundProxy.address);

        const [user1Balance] = await redeemFund(user1, fundProxy, denomination, user1RedeemShare, false);
        const [user2Balance, fundState2] = await redeemFund(user2, fundProxy, denomination, user2RedeemShare, false);
        const [user3Balance, fundState3] = await redeemFund(
          user3,
          fundProxy,
          denomination,
          user3RedeemShare,
          acceptPending
        );

        const fundShareTokenAfter = await shareToken.balanceOf(fundProxy.address);
        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        const user3Share = await shareToken.balanceOf(user3.address);

        expect(user1And2ExpectedRedeemBalance).to.be.eq(user1Balance);
        expect(user1And2ExpectedRedeemBalance).to.be.eq(user2Balance);
        expect(user3ExpectedRedeemBalance).to.be.gt(user3Balance);
        expect(fundShareTokenAfter).to.be.gt(fundShareTokenBefore);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user3Share).to.be.eq(0);
        expect(fundState2).to.be.eq(FUND_STATE.EXECUTING);
        expect(fundState3).to.be.eq(FUND_STATE.PENDING);
      });
    }); // describe('Executing --> Pending') end
  }); // describe('state change') end

  describe('Claimable pending', function () {
    const purchaseAmount = mwei('4000');
    const swapAmount = mwei('3000');
    const reserveAmount = purchaseAmount.sub(swapAmount);
    const redeemAmount = reserveAmount.add(mwei('100'));

    beforeEach(async function () {
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
    });

    it('user1 redeem and fund remains in executing', async function () {
      // purchase to make pending amount to be settled
      const [, fundState2] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
      expect(fundState2).to.be.eq(FUND_STATE.EXECUTING);

      // check user1 pending redemption is claimable or not
      const claimable = await fundProxy.isPendingRedemptionClaimable(user1.address);
      expect(claimable).to.be.true;

      const expectedClaimableAmount = await fundProxy.callStatic.claimPendingRedemption(user1.address);

      // user1 redeem
      const user1ShareBefore = await shareToken.balanceOf(user1.address);
      const expectedRedeemBalance = await fundProxy.calculateBalance(user1ShareBefore);
      const user1BalanceBefore = await denomination.balanceOf(user1.address);

      const redeemTx = await fundProxy.connect(user1).redeem(user1ShareBefore, true);

      const user1BalanceAfter = await denomination.balanceOf(user1.address);
      const user1ShareAfter = await shareToken.balanceOf(user1.address);
      const fundState = await fundProxy.state();

      expect(expectedClaimableAmount.add(expectedRedeemBalance)).to.be.eq(user1BalanceAfter.sub(user1BalanceBefore));
      expect(redeemTx).to.emit(fundProxy, 'RedemptionClaimed').withArgs(user1.address);
      expect(fundState).to.be.eq(FUND_STATE.EXECUTING);
      expect(user1ShareAfter).to.be.eq(0);
    });

    it('user1 redeem and fund goes to pending', async function () {
      // purchase to make pending amount to be settled
      const [, fundState2] = await purchaseFund(
        user2,
        fundProxy,
        denomination,
        shareToken,
        redeemAmount.sub(reserveAmount).add(mwei('100')) // makes fund goes to executing and without too much reserve
      );

      expect(fundState2).to.be.eq(FUND_STATE.EXECUTING);

      // check user1 pending redemption is claimable or not
      const claimable = await fundProxy.isPendingRedemptionClaimable(user1.address);
      expect(claimable).to.be.true;

      const expectedClaimableAmount = await fundProxy.callStatic.claimPendingRedemption(user1.address);

      // user1 redeem
      const user1ShareBefore = await shareToken.balanceOf(user1.address);
      const expectedRedeemBalance = await fundProxy.calculateBalance(user1ShareBefore);
      const user1BalanceBefore = await denomination.balanceOf(user1.address);

      const redeemTx = await fundProxy.connect(user1).redeem(user1ShareBefore, true);

      const user1BalanceAfter = await denomination.balanceOf(user1.address);
      const user1ShareAfter = await shareToken.balanceOf(user1.address);
      const fundState = await fundProxy.state();

      expect(expectedClaimableAmount.add(expectedRedeemBalance)).to.be.gt(user1BalanceAfter.sub(user1BalanceBefore));
      expect(redeemTx).to.emit(fundProxy, 'RedemptionClaimed').withArgs(user1.address);
      expect(fundState).to.be.eq(FUND_STATE.PENDING);
      expect(user1ShareAfter).to.be.eq(0);
    });
  });

  describe('Dead oracle', function () {
    const purchaseAmount = mwei('2000');
    const swapAmount = purchaseAmount.div(2);

    beforeEach(async function () {
      await setExecutingAssetFund(
        manager,
        user0,
        fundProxy,
        denomination,
        shareToken,
        purchaseAmount,
        swapAmount,
        execFeePercentage,
        denominationAddress,
        tokenBAddress,
        hFunds,
        aFurucombo,
        taskExecutor,
        hQuickSwap
      );

      await oracle.connect(owner).setStalePeriod(1);
      await increaseNextBlockTimeBy(ONE_DAY);
    });

    it('should revert: CHAINLINK_STALE_PRICE', async function () {
      const share = await shareToken.balanceOf(user0.address);
      await expect(fundProxy.connect(user0).redeem(share, true)).to.be.revertedWith('RevertCode(45)'); // CHAINLINK_STALE_PRICE
    });
  }); // describe('Dead oracle') end

  describe('Other should revert cases', function () {
    const purchaseAmount = mwei('2000');
    const swapAmount = purchaseAmount.div(2);
    const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('100'));
    it('should revert: redeem in liquidating', async function () {
      await setLiquidatingAssetFund(
        manager,
        user0,
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
      const share = await shareToken.balanceOf(user0.address);
      await expect(fundProxy.connect(user0).redeem(share, true)).to.be.revertedWith('InvalidState(4)'); // LIQUIDATING
    });

    it('should revert: redeem more than user share', async function () {
      await setExecutingAssetFund(
        manager,
        user0,
        fundProxy,
        denomination,
        shareToken,
        initialFunds,
        swapAmount,
        execFeePercentage,
        denominationAddress,
        tokenAAddress,
        hFunds,
        aFurucombo,
        taskExecutor,
        hQuickSwap
      );
      const share = await shareToken.balanceOf(user0.address);
      await expect(fundProxy.connect(user0).redeem(share.add(1), true)).to.be.revertedWith('RevertCode(73)'); // SHARE_MODULE_INSUFFICIENT_SHARE
    });

    it('should revert: redeem zero share', async function () {
      await expect(fundProxy.connect(user0).redeem(0, true)).to.be.revertedWith('RevertCode(72)'); // SHARE_MODULE_REDEEM_ZERO_SHARE
    });
  }); // describe('Other should revert cases') end
});
