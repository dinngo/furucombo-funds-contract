import { Wallet, Signer, BigNumber } from 'ethers';
import { deployments } from 'hardhat';
import { expect } from 'chai';
//test
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
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  createFund,
  purchaseFund,
  setPendingAssetFund,
  setExecutingDenominationFund,
  setExecutingAssetFund,
  execSwap,
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
  FEE_BASE,
} from '../utils/constants';



describe('InvestorPurchaseFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor0: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let investor1: Wallet, investor2: Wallet, investor3: Wallet;

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

  let fundProxy: FundImplementation;
  let fundVault: string;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor0, investor1, investor2, investor3, liquidator] = await (
      ethers as any
    ).getSigners();

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
      stakeAmount,
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
  
    // Transfer token to investor0
    await denomination.connect(denominationProvider).transfer(investor0.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(investor1.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(investor2.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(investor3.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });

  async function getExpectedShareWhenPending(amount:BigNumber) {
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

  beforeEach(async function () {
    await setupTest();
  });

  describe('Without state change', function () {
    const purchaseAmount = mwei('2000');

    describe('Executing state', function () {
      it('investor1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const [share] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(share).to.be.eq(purchaseAmount); // initial mint, share = purchaseAmount
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount));
      });

      it('investor1 and investor2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, purchaseAmount);

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(BigNumber.from('2'))));
        expect(share1).to.be.eq(share2);
      });

      it('investor1, investor2 and investor3 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, purchaseAmount);

        // investor3 purchase
        const [share3] = await purchaseFund(
          investor3,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount.mul(BigNumber.from('2'))
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(BigNumber.from('4'))));
        expect(share1).to.be.eq(share2);
        expect(share3).to.be.eq(share1.add(share2));
      });
    }); // describe('Executing state') ends

    describe('Pending state', function () {
      const swapAmount = purchaseAmount.div(2);
      const reserveAmount = purchaseAmount.sub(swapAmount);
      const redeemAmount = reserveAmount.add(mwei('500'));
      const pendingPurchaseAmount = mwei('50');
      beforeEach(async function () {
        await setPendingAssetFund(
          manager,
          investor0,
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

      it('investor1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const [share, state] = await purchaseFund(
          investor1,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount));
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });
      it('investor1 and investor2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // investor2 purchase
        const [share2, state] = await purchaseFund(
          investor2,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(2)));
        expect(share1).to.be.eq(share2);
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });

      it('investor1, investor2 and investor3 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // investor3 purchase
        const [share3, state] = await purchaseFund(
          investor3,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount.mul(2)
        );

        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(4)));
        expect(share1).to.be.eq(share2);
        expect(share3).to.be.gte(share1.add(share2));
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });
    }); // describe('Pending state') end

    describe('Executing state, funds with other asset', function () {
      const swapAmount = purchaseAmount.div(2);
      beforeEach(async function () {
        await setExecutingAssetFund(
          manager,
          investor0,
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

      it('investor1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const [share, state] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        //const expectedShare = await fundProxy.calculateShare(purchaseAmount);

        // expect(share).to.be.eq(expectedShare);
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount));
      });

      it('investor1 and investor2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, purchaseAmount);
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(share1).to.be.eq(share2);
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(2)));
      });

      it('investor1, investor2 and investor3 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, purchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, purchaseAmount);

        // investor3 purchase
        const [share3] = await purchaseFund(investor3, fundProxy, denomination, shareToken, purchaseAmount.mul(2));
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        expect(share1).to.be.eq(share2);
        expect(share3).to.be.eq(share1.add(share2));
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(purchaseAmount.mul(4)));
      });
    });

    describe('Pending state, funds with other asset', function () {
      const swapAmount = purchaseAmount.div(2);
      const reserveAmount = purchaseAmount.sub(swapAmount);
      const redeemAmount = reserveAmount.add(mwei('500'));
      const pendingPurchaseAmount = mwei('50');
      beforeEach(async function () {
        await setPendingAssetFund(
          manager,
          investor0,
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

      it('investor1 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);
        const [share, state] = await purchaseFund(
          investor1,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);
        // const expectedShare = await fundProxy.calculateShare(pendingPurchaseAmount);

        // expect(share).to.be.eq(expectedShare);
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount));
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });

      it('investor1 and investor2 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // const expectedShare1 = await fundProxy.calculateShare(pendingPurchaseAmount);

        // investor2 purchase
        const [share2, state] = await purchaseFund(
          investor2,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount
        );
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        // expect(share1).to.be.eq(expectedShare1);
        expect(share1).to.be.eq(share2);
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(2)));
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });

      it('investor1, investor2 and investor3 purchase', async function () {
        const vaultBalanceBefore = await denomination.balanceOf(fundVault);

        // investor1 purchase
        const [share1] = await purchaseFund(investor1, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // const expectedShare1 = await fundProxy.calculateShare(pendingPurchaseAmount);

        // investor2 purchase
        const [share2] = await purchaseFund(investor2, fundProxy, denomination, shareToken, pendingPurchaseAmount);

        // investor3 purchase
        const [share3, state] = await purchaseFund(
          investor3,
          fundProxy,
          denomination,
          shareToken,
          pendingPurchaseAmount.mul(2)
        );
        const vaultBalanceAfter = await denomination.balanceOf(fundVault);

        // const expectedShare3 = await fundProxy.calculateShare(pendingPurchaseAmount.mul(2));

        // expect(share1).to.be.eq(expectedShare1);
        expect(share1).to.be.eq(share2);
        expect(share3).to.be.gte(share1.add(share2));
        // expect(share3).to.be.eq(expectedShare3);
        expect(vaultBalanceAfter).to.be.eq(vaultBalanceBefore.add(pendingPurchaseAmount.mul(4)));
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
          investor0,
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

      it('investor1 purchase', async function () {
        const solvePendingPurchaseAmount = mwei('600');
        const [share, state] = await purchaseFund(
          investor1,
          fundProxy,
          denomination,
          shareToken,
          solvePendingPurchaseAmount
        );
        
        // const expectedShare = await fundProxy.calculateShare(pendingPurchaseAmount);

        // expect(share).to.be.eq(expectedShare);
        
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('investor1 and investor2 purchase', async function () {
        const amount = mwei('100');
        const solvePendingPurchaseAmount = mwei('600');
        
        // investor1 purchase
        const [share1, state1] = await purchaseFund(
          investor1,
          fundProxy,
          denomination,
          shareToken,
          amount
        );

        // investor2 purchase
        const [share2, state2] = await purchaseFund(
          investor2,
          fundProxy,
          denomination,
          shareToken,
          solvePendingPurchaseAmount
        );
        
        // const expectedShare = await fundProxy.calculateShare(pendingPurchaseAmount);

        // expect(share).to.be.eq(expectedShare);
        console.log("share1:" + share1.toString());
        console.log("share2:" + share2.toString());
        expect(state1).to.be.eq(FUND_STATE.PENDING);
        expect(state2).to.be.eq(FUND_STATE.EXECUTING);
      });

      it.only('investor1, investor2 and investor3 purchase', async function () {
        const amount = mwei('100');
        const solvePendingPurchaseAmount = mwei('600');
        
        
        // investor1 purchase
        const expectedShare1 = await getExpectedShareWhenPending(amount);
        const [share1, state1] = await purchaseFund(
          investor1,
          fundProxy,
          denomination,
          shareToken,
          amount
        );
          console.log("expectedShare1:" + expectedShare1.toString());
          console.log("share1:" + share1.toString());
          console.log("");


        // investor2 purchase
        const expectedShare2 = await getExpectedShareWhenPending(amount);

        const [share2, state2] = await purchaseFund(
          investor2,
          fundProxy,
          denomination,
          shareToken,
          amount
        );
        console.log("expectedShare2:" + expectedShare2.toString());
        console.log("share2:" + share2.toString());
        console.log("");


       

        // investor3 purchase
        const expectedShare3 = await getExpectedShareWhenPending(solvePendingPurchaseAmount);

        const [share3, state3] = await purchaseFund(
          investor3,
          fundProxy,
          denomination,
          shareToken,
          solvePendingPurchaseAmount
        );
        console.log("expectedShare3:" + expectedShare3.toString());
        console.log("share3:" + share3.toString());
        // const expectedShare = await fundProxy.calculateShare(pendingPurchaseAmount);

        // expect(share).to.be.eq(expectedShare);
        expect(state1).to.be.eq(FUND_STATE.PENDING);
        expect(state2).to.be.eq(FUND_STATE.PENDING);
        expect(state3).to.be.eq(FUND_STATE.EXECUTING);
      });

    });
  }); // describe('With state change') end
});
