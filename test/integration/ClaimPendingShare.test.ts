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
  ComptrollerImplementation,
  Chainlink,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, increaseNextBlockTimeBy } from '../utils/utils';

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
} from '../utils/constants';

describe('ClaimPendingShare', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let user1: Wallet, user2: Wallet, user3: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let fundVault: string;

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
  const execFeePercentage = 0; // 0%
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
  let comptroller: ComptrollerImplementation;
  let oracle: Chainlink;
  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;

  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, user1, user2, user3, liquidator] = await (ethers as any).getSigners();

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
      shareTokenName,
      fRegistry,
      furucombo
    );

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user1.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user2.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user3.address, initialFunds);
  });

  async function getExpectedClaimAmount(address: string): Promise<BigNumber> {
    const userPendingShare = (await fundProxy.pendingUsers(address)).pendingShare;
    const totalPendingShare = (await fundProxy.pendingRoundList(0)).totalPendingShare;
    const totalRedemption = (await fundProxy.pendingRoundList(0)).totalRedemption;

    return totalRedemption.mul(userPendingShare).div(totalPendingShare);
  }

  async function spendAllAndMakeFundGoesToPending(user: Wallet) {
    const vaultBalance = await denomination.balanceOf(fundVault);
    await execSwap(
      vaultBalance,
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
    const userShare = await shareToken.balanceOf(user.address);
    const [, state] = await redeemFund(user, fundProxy, denomination, userShare, true);
    expect(state).to.be.eq(FUND_STATE.PENDING);
  }

  async function makeFundGoesToLiquidating() {
    await oracle.setStalePeriod(pendingExpiration * 2);
    await increaseNextBlockTimeBy(pendingExpiration);
    await fundProxy.connect(liquidator).liquidate();
    expect(await fundProxy.state()).to.be.eq(FUND_STATE.LIQUIDATING);
  }

  async function claimAndCheckCorrectness(address: string) {
    const beforeBalance = await denomination.balanceOf(address);
    const expectedClaimAmount = await getExpectedClaimAmount(address);
    await fundProxy.claimPendingRedemption(address);
    const afterBalance = await denomination.balanceOf(address);
    expect(afterBalance).to.be.eq(beforeBalance.add(expectedClaimAmount));
  }

  beforeEach(async function () {
    await setupTest();
  });

  describe('success cases', function () {
    describe('Executing', function () {
      it('claim pending share', async function () {
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
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );

        // purchase fund and resolve pending state
        const [, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('2 users claim pending share', async function () {
        await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);
        await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

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
        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        await redeemFund(user1, fundProxy, denomination, user1Share, acceptPending);
        await redeemFund(user2, fundProxy, denomination, user2Share, acceptPending);

        // purchase fund and resolve pending state
        await denomination.connect(denominationProvider).transfer(user3.address, purchaseAmount.mul(2));
        const [, state] = await purchaseFund(user3, fundProxy, denomination, shareToken, purchaseAmount.mul(2));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // user2 claim pending
        await claimAndCheckCorrectness(user2.address);
      });
    });

    describe('Pending', function () {
      const acceptPending = true;
      it('claim pending share', async function () {
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
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );

        // purchase fund and resolve pending state
        const [, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        await spendAllAndMakeFundGoesToPending(user2);

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);
      });

      it('2 users claim pending share', async function () {
        await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);
        await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

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

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        await redeemFund(user1, fundProxy, denomination, user1Share, acceptPending);
        await redeemFund(user2, fundProxy, denomination, user2Share, acceptPending);

        // purchase fund and resolve pending state
        await denomination.connect(denominationProvider).transfer(user3.address, purchaseAmount.mul(3));
        const [, state] = await purchaseFund(user3, fundProxy, denomination, shareToken, purchaseAmount.mul(3));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        await spendAllAndMakeFundGoesToPending(user3);

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);

        // user2 claim pending
        await claimAndCheckCorrectness(user2.address);
      });
    });

    describe('Liquidating', function () {
      it('claim pending share', async function () {
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
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );

        // purchase fund and resolve pending state
        const [, state] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        await spendAllAndMakeFundGoesToPending(user2);

        await makeFundGoesToLiquidating();

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);
      });

      it('2 users claim pending share', async function () {
        await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);
        await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

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
        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        await redeemFund(user1, fundProxy, denomination, user1Share, acceptPending);
        await redeemFund(user2, fundProxy, denomination, user2Share, acceptPending);

        // purchase fund and resolve pending state
        await denomination.connect(denominationProvider).transfer(user3.address, purchaseAmount.mul(3));
        const [, state] = await purchaseFund(user3, fundProxy, denomination, shareToken, purchaseAmount.mul(3));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        await spendAllAndMakeFundGoesToPending(user3);

        await makeFundGoesToLiquidating();

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);

        // user2 claim pending
        await claimAndCheckCorrectness(user2.address);
      });
    });
    describe('Closed', function () {
      it('claim pending share', async function () {
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
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );

        // purchase fund and resolve pending state
        const [, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        // swap asset back to denomination
        const swapAssetAmount = await tokenA.balanceOf(await fundProxy.vault());
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

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);
      });

      it('2 users claim pending share', async function () {
        const [userShare1] = await purchaseFund(user1, fundProxy, denomination, shareToken, purchaseAmount);
        const [userShare2] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);

        // spend denomination
        const swapAmount = purchaseAmount.mul(2);
        await execSwap(
          swapAmount,
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

        // redeem pending
        const acceptPending = true;
        await redeemFund(user1, fundProxy, denomination, userShare1, acceptPending);
        await redeemFund(user2, fundProxy, denomination, userShare2, acceptPending);

        // investor 3 purchase fund and resolve pending state
        await denomination.connect(denominationProvider).transfer(user3.address, purchaseAmount.mul(3));
        const [, state] = await purchaseFund(user3, fundProxy, denomination, shareToken, purchaseAmount.mul(3));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        // swap asset back to denomination
        const swapAssetAmount = await tokenA.balanceOf(await fundProxy.vault());
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

        // close fund
        await fundProxy.connect(manager).close();
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);

        // user1 claim pending
        await claimAndCheckCorrectness(user1.address);

        // user2 claim pending
        await claimAndCheckCorrectness(user2.address);
      });
    });
  });

  describe('fail cases', function () {
    it('should revert: without purchase', async function () {
      await expect(fundProxy.claimPendingRedemption(investor.address)).to.be.revertedWith('RevertCode(76)'); // SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
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
