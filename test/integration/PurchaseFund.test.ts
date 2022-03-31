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
  IComptroller,
  Chainlink,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, increaseNextBlockTimeBy, expectEqWithinBps } from '../utils/utils';

<<<<<<< HEAD
import { createFund, purchaseFund, setPendingAssetFund, setExecutingAssetFund } from './fund';
=======
import {
  createFund,
  purchaseFund,
  setPendingAssetFund,
  setExecutingDenominationFund,
  setExecutingAssetFund,
  execSwap,
} from './fund';
>>>>>>> e19a20c (rebase develop)
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
  ONE_YEAR,
  FEE_BASE,
} from '../utils/constants';

describe('InvestorPurchaseFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let user0: Wallet, user1: Wallet, user2: Wallet, user3: Wallet;

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
  const mFeeRate10Percent = 1000;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('6000');

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let comptroller: IComptroller;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
<<<<<<< HEAD
  let oracle: Chainlink;
=======

>>>>>>> e19a20c (rebase develop)
  let fundProxy: FundImplementation;
  let fundVault: string;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

<<<<<<< HEAD
  async function getExpectedShareWhenPending(amount: BigNumber) {
    const share = await fundProxy.calculateShare(amount);
    const bonus = await getPendingBonus(share);
    return share.add(bonus);
  }

  async function getPendingBonus(share: BigNumber) {
    const currentTotalPendingBonus = await fundProxy.currentTotalPendingBonus();
    const penalty = await comptroller.pendingPenalty();

    let bonus = share.mul(penalty).div(BigNumber.from(FEE_BASE).sub(penalty));
    bonus = currentTotalPendingBonus > bonus ? bonus : currentTotalPendingBonus;
    return bonus;
  }

  describe('Funds without management fee', function () {
    const purchaseAmount = mwei('2000');
    const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, user0, user1, user2, user3, liquidator] = await (ethers as any).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [
        fundProxy,
        fundVault,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
        ,
        ,
        oracle,
        comptroller,
        ,
        hQuickSwap,
        ,
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
        mortgageAmount,
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        crystallizationPeriod,
        reserveExecutionRatio,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to users
      await denomination.connect(denominationProvider).transfer(user0.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user1.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user2.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user3.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    });

    beforeEach(async function () {
      await setupTest();
    });

    describe('Without state change', function () {
      describe('Executing state', function () {
        it('user1 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);
          const user1ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
          const [user1Share, state] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount));
          expect(user1Share).to.be.eq(purchaseAmount); // initial mint, share = purchaseAmount
          expect(user1Share).to.be.eq(user1ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1 and user2 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
          const [user2Share, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(BigNumber.from('2'))));

          expect(user1Share).to.be.eq(user2Share);
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1, user2 and user3 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
          const [user2Share] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

          // user3 purchase
          const user3ExpectedShare = await fundProxy.calculateShare(purchaseAmount.mul(BigNumber.from('2')));
          const [user3Share, state] = await purchaseFund(
            user3,
            fundProxy,
            denomination,
            shareToken,
            purchaseAmount.mul(BigNumber.from('2'))
          );

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(BigNumber.from('4'))));

          expect(user1Share).to.be.eq(user2Share);
          expect(user3Share).to.be.eq(user1Share.add(user2Share));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);
          expect(user3Share).to.be.eq(user3ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });
      }); // describe('Executing state') ends

      describe('Pending state', function () {
        const swapAmount = purchaseAmount.div(2);
        const reserveAmount = purchaseAmount.sub(swapAmount);
        const redeemAmount = reserveAmount.add(mwei('500'));
        const pendingPurchaseAmount = mwei('100');
        beforeEach(async function () {
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
            tokenAAddress,
            hFunds,
            aFurucombo,
            taskExecutor,
            hQuickSwap
          );
        });

        it('user1 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share, state] = await purchaseFund(
            user1,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount
          );

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(state).to.be.eq(FUND_STATE.PENDING);
        });

        it('user1 and user2 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user2Share, state] = await purchaseFund(
            user2,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount
          );

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(2)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.PENDING);
        });

        it('user1, user2 and user3 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user2Share] = await purchaseFund(user2, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user3 purchase
          const user3ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount.mul(2));
          const [user3Share, state] = await purchaseFund(
            user3,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount.mul(2)
          );

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(4)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user3Share).to.be.gte(user1Share.add(user2Share));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);
          expect(user3Share).to.be.eq(user3ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.PENDING);
        });
      }); // describe('Pending state') end

      describe('Executing state, funds with other asset', function () {
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
        });

        it('user1 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);
          const user1ExpectedShare = await getExpectedShareWhenPending(purchaseAmount);
          const [user1Share, state] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);
          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount));
          expect(user1Share).to.be.eq(user1ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1 and user2 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(purchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(purchaseAmount);
          const [user2Share, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(2)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1, user2 and user3 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(purchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(purchaseAmount);
          const [user2Share] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

          // user3 purchase
          const user3ExpectedShare = await getExpectedShareWhenPending(purchaseAmount.mul(2));
          const [user3Share, state] = await purchaseFund(
            user3,
            fundProxy,
            denomination,
            shareToken,
            purchaseAmount.mul(2)
          );

          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(4)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user3Share).to.be.eq(user1Share.add(user2Share));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);
          expect(user3Share).to.be.eq(user3ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
        });
      });

      describe('Pending state, funds with other asset', function () {
        const swapAmount = purchaseAmount.div(2);
        const reserveAmount = purchaseAmount.sub(swapAmount);
        const redeemAmount = reserveAmount.add(mwei('500'));
        const pendingPurchaseAmount = mwei('100');
        beforeEach(async function () {
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
            tokenAAddress,
            hFunds,
            aFurucombo,
            taskExecutor,
            hQuickSwap
          );
        });

        it('user1 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share, state] = await purchaseFund(
            user1,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount
          );
          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(state).to.be.eq(FUND_STATE.PENDING);
        });

        it('user1 and user2 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user2Share, state] = await purchaseFund(
            user2,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount
          );
          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(2)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.PENDING);
        });

        it('user1, user2 and user3 purchase', async function () {
          const vaultBalanceBefore = await denomination.balanceOf(fundVault);

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
          const [user2Share] = await purchaseFund(user2, fundProxy, denomination, shareToken, pendingPurchaseAmount);

          // user3 purchase
          const user3ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount.mul(2));
          const [user3Share, state] = await purchaseFund(
            user3,
            fundProxy,
            denomination,
            shareToken,
            pendingPurchaseAmount.mul(2)
          );
          const vaultBalanceAfter = await denomination.balanceOf(fundVault);

          expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(4)));

          expect(user1Share).to.be.eq(user2Share);
          expect(user3Share).to.be.gte(user1Share.add(user2Share));
          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);
          expect(user3Share).to.be.eq(user3ExpectedShare);

          expect(state).to.be.eq(FUND_STATE.PENDING);
        });
      });
    }); // describe('Without state change') end

    describe('With state change', function () {
      const purchaseAmount = mwei('2000');

      describe('Pending state', function () {
        const swapAmount = purchaseAmount.div(2);
        const reserveAmount = purchaseAmount.sub(swapAmount);
        const redeemAmount = reserveAmount.add(mwei('500'));

        beforeEach(async function () {
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
            tokenAAddress,
            hFunds,
            aFurucombo,
            taskExecutor,
            hQuickSwap
          );
        });

        it('user1 purchase', async function () {
          const solvePendingPurchaseAmount = mwei('600');
          const user1ExpectedShare = await getExpectedShareWhenPending(solvePendingPurchaseAmount);
          const [user1Share, user1State] = await purchaseFund(
            user1,
            fundProxy,
            denomination,
            shareToken,
            solvePendingPurchaseAmount
          );

          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user1State).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1 and user2 purchase', async function () {
          const amount = mwei('100');
          const solvePendingPurchaseAmount = mwei('600');

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(amount);
          const [user1Share, user1State] = await purchaseFund(user1, fundProxy, denomination, shareToken, amount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(solvePendingPurchaseAmount);
          const [user2Share, user2State] = await purchaseFund(
            user2,
            fundProxy,
            denomination,
            shareToken,
            solvePendingPurchaseAmount
          );

          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);

          expect(user1State).to.be.eq(FUND_STATE.PENDING);
          expect(user2State).to.be.eq(FUND_STATE.EXECUTING);
        });

        it('user1, user2 and user3 purchase', async function () {
          const amount = mwei('100');
          const solvePendingPurchaseAmount = mwei('600');

          // user1 purchase
          const user1ExpectedShare = await getExpectedShareWhenPending(amount);
          const [user1Share, user1State] = await purchaseFund(user1, fundProxy, denomination, shareToken, amount);

          // user2 purchase
          const user2ExpectedShare = await getExpectedShareWhenPending(amount);
          const [user2Share, user2State] = await purchaseFund(user2, fundProxy, denomination, shareToken, amount);

          // user3 purchase
          const user3ExpectedShare = await getExpectedShareWhenPending(solvePendingPurchaseAmount);
          const [user3Share, user3State] = await purchaseFund(
            user3,
            fundProxy,
            denomination,
            shareToken,
            solvePendingPurchaseAmount
          );

          expect(user1Share).to.be.eq(user1ExpectedShare);
          expect(user2Share).to.be.eq(user2ExpectedShare);
          expect(user3Share).to.be.eq(user3ExpectedShare);

          expect(user1State).to.be.eq(FUND_STATE.PENDING);
          expect(user2State).to.be.eq(FUND_STATE.PENDING);
          expect(user3State).to.be.eq(FUND_STATE.EXECUTING);
        });
=======
  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [
      fundProxy,
      fundVault,
      denomination,
      shareToken,
      taskExecutor,
      aFurucombo,
      hFunds,
      tokenA,
      tokenB,
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
      mortgageAmount,
      mFeeRate,
      pFeeRate,
      execFeePercentage,
      pendingExpiration,
      valueTolerance,
      crystallizationPeriod,
      reserveExecutionRatio,
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

  describe('purchase fund in executing and stay in executing', function () {
    const purchaseAmount = mwei('1500');

    describe('purchase empty fund', function () {
      it('1 user purchase', async function () {
        const initBalance = await denomination.balanceOf(fundVault);
        const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

        const afterBalance = await denomination.balanceOf(fundVault);

        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(share).to.be.eq(purchaseAmount);
        expect(afterBalance).to.be.eq(initBalance.add(purchaseAmount));
      });
    });
    describe('purchase denomination fund', function () {
      beforeEach(async function () {
        await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
      });
      it('with the same user purchase', async function () {
        const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(purchaseAmount.eq(BigNumber.from(share))).to.be.true;
      });
      it('with different user purchase', async function () {
        const [share, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);

        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(purchaseAmount.eq(BigNumber.from(share))).to.be.true;
      });
      it('send denomination to vault', async function () {
        const initBalance = await denomination.balanceOf(fundVault);
        const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        const afterBalance = await denomination.balanceOf(fundVault);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(afterBalance).to.be.eq(initBalance.add(purchaseAmount));
>>>>>>> e19a20c (rebase develop)
      });
    }); // describe('With state change') end

    describe('Dead oracle', function () {
      const purchaseAmount = mwei('2000');
      const swapAmount = purchaseAmount.div(2);

      beforeEach(async function () {
        await setExecutingAssetFund(
          manager,
<<<<<<< HEAD
          user0,
=======
          investor,
>>>>>>> e19a20c (rebase develop)
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
<<<<<<< HEAD

      it('should revert: CHAINLINK_STALE_PRICE', async function () {
        await denomination.connect(user1).approve(fundProxy.address, mwei('100'));
        await expect(fundProxy.connect(user1).purchase(mwei('100'))).to.be.revertedWith('RevertCode(48)'); // CHAINLINK_STALE_PRICE
      });
    }); // describe('Dead oracle') end
  });

  describe('Funds with management fee', function () {
    const purchaseAmount = mwei('2000');

    const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, user0, user1, user2, user3, liquidator] = await (ethers as any).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [
        fundProxy,
        fundVault,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
        ,
        ,
        oracle,
        comptroller,
        ,
        hQuickSwap,
        ,
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
        mortgageAmount,
        mFeeRate10Percent,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        crystallizationPeriod,
        reserveExecutionRatio,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to users
      await denomination.connect(denominationProvider).transfer(user0.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user1.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user2.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(user3.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    });

    beforeEach(async function () {
      await setupTest();
    });

    describe('Executing state', function () {
      beforeEach(async function () {
        [
          fundProxy,
          fundVault,
          denomination,
          shareToken,
          taskExecutor,
          aFurucombo,
          hFunds,
          ,
          ,
          oracle,
          comptroller,
          ,
          hQuickSwap,
          ,
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
          mortgageAmount,
          mFeeRate10Percent,
          pFeeRate,
          execFeePercentage,
          pendingExpiration,
          valueTolerance,
          crystallizationPeriod,
          reserveExecutionRatio,
          shareTokenName,
          fRegistry,
          furucombo
        );
      });

      it('user1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const managerShareBalanceBefore = await shareToken.balanceOf(manager.address);
        const user1ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [user1Share, state] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        const managerShareBalanceAfter = await shareToken.balanceOf(manager.address);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount));
        expect(user1Share).to.be.eq(purchaseAmount); // initial mint, share = purchaseAmount
        expect(user1Share).to.be.eq(user1ExpectedShare);

        // initial mint, manager shouldn't get management fee
        expect(managerShareBalanceAfter.sub(managerShareBalanceBefore)).to.be.eq(0);

        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1 and user2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const managerShareBalanceBefore = await shareToken.balanceOf(manager.address);

        // user1 purchase
        const user1ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);

        // user2 purchase
        const user2ExpectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [user2Share, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        const managerShareBalanceAfter = await shareToken.balanceOf(manager.address);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(BigNumber.from('2'))));

        expect(user1Share).to.be.eq(user1ExpectedShare);
        expectEqWithinBps(user2Share, user2ExpectedShare, 10); // Didn't include management fee when calculate user2ExpectedShare, but they should really close
        expect(user2Share).to.be.gt(user1Share); // user2 purchase after user1, user2's share should greater than user1's share

        // manager should get some management fee
        expect(managerShareBalanceAfter.sub(managerShareBalanceBefore)).to.be.gt(0);

        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });
    });

    describe('Pending state', function () {
      const swapAmount = purchaseAmount.div(2);
      const reserveAmount = purchaseAmount.sub(swapAmount);
      const redeemAmount = reserveAmount.add(mwei('500'));
      const pendingPurchaseAmount = mwei('100');
      beforeEach(async function () {
        [
          fundProxy,
          fundVault,
          denomination,
          shareToken,
          taskExecutor,
          aFurucombo,
          hFunds,
          ,
          ,
          oracle,
          comptroller,
          ,
          hQuickSwap,
          ,
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
          mortgageAmount,
          mFeeRate10Percent,
          pFeeRate,
          execFeePercentage,
          pendingExpiration,
          valueTolerance,
          crystallizationPeriod,
          reserveExecutionRatio,
          shareTokenName,
          fRegistry,
          furucombo
        );

        await setPendingAssetFund(
          manager,
          user0,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount,
          swapAmount,
          redeemAmount,
=======
      it('with the same user purchase', async function () {
        const expectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(BigNumber.from(share)).to.be.eq(expectedShare);
      });
      it('different user purchase', async function () {
        const expectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [share, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(BigNumber.from(share)).to.be.eq(expectedShare);
      });
      it('send denomination to vault', async function () {
        const initBalance = await denomination.balanceOf(fundVault);
        const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        const afterBalance = await denomination.balanceOf(fundVault);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(afterBalance).to.be.eq(initBalance.add(purchaseAmount));
      });
      it('with 1 swap between 2 different user purchase', async function () {
        const _swapAmount = purchaseAmount.sub(swapAmount);
        const path = [denomination.address, tokenB.address, tokenA.address];
        const tos = [hFunds.address, hQuickSwap.address];
        await execSwap(
          _swapAmount,
>>>>>>> e19a20c (rebase develop)
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
<<<<<<< HEAD
          hQuickSwap
=======
          fundProxy,
          manager
>>>>>>> e19a20c (rebase develop)
        );
      });

<<<<<<< HEAD
      it('user1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const managerShareBalanceBefore = await shareToken.balanceOf(manager.address);
        const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
        const [user1Share, state] = await purchaseFund(
          user1,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        const managerShareBalanceAfter = await shareToken.balanceOf(manager.address);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount));
        expect(user1Share).to.be.eq(user1ExpectedShare);

        // manager shouldn't get management fee when pending state
        expect(managerShareBalanceAfter.sub(managerShareBalanceBefore)).to.be.eq(0);

        expect(state).to.be.eq(FUND_STATE.PENDING);
=======
        const expectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [share, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(BigNumber.from(share)).to.be.eq(expectedShare);
>>>>>>> e19a20c (rebase develop)
      });

<<<<<<< HEAD
      it('user1 and user2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const managerShareBalanceBefore = await shareToken.balanceOf(manager.address);

        // user1 purchase
        const user1ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
        const [user1Share] = await purchaseFund(user1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // user2 purchase
        const user2ExpectedShare = await getExpectedShareWhenPending(pendingPurchaseAmount);
        const [user2Share, state] = await purchaseFund(
          user2,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        const managerShareBalanceAfter = await shareToken.balanceOf(manager.address);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(BigNumber.from('2'))));

        expect(user1Share).to.be.eq(user1ExpectedShare);
        expect(user2Share).to.be.eq(user2ExpectedShare);
        expect(user2Share).to.be.eq(user1Share);

        // manager shouldn't get management fee when pending state
        expect(managerShareBalanceAfter.sub(managerShareBalanceBefore)).to.be.eq(0);

        expect(state).to.be.eq(FUND_STATE.PENDING);
      });
=======
  describe('purchase fund in pending', function () {
    const purchaseAmount = mwei('2000');
    const swapAmount = purchaseAmount.div(2);
    const reserveAmount = purchaseAmount.sub(swapAmount);
    const redeemAmount = reserveAmount.add(mwei('100')); //1100
    const pendingAmount = redeemAmount.sub(reserveAmount);

    beforeEach(async function () {
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

    it('stay in pending when the same user purchase succeeds', async function () {
      const _purchaseAmount = pendingAmount.div(2);
      const expectedShare = await fundProxy.calculateShare(_purchaseAmount);

      const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, _purchaseAmount);

      // check state & bonus
      expect(state).to.be.eq(FUND_STATE.PENDING);
      expect(BigNumber.from(share)).to.be.gt(expectedShare);
    });

    it('change from pending to executing when purchase succeeeds', async function () {
      const _purchaseAmount = pendingAmount;
      const expectedShare = await fundProxy.calculateShare(_purchaseAmount);

      const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, _purchaseAmount);

      // check state & bonus
      expect(state).to.be.eq(FUND_STATE.EXECUTING);
      expect(BigNumber.from(share)).to.be.gt(expectedShare);
>>>>>>> e19a20c (rebase develop)
    });
  });
});
