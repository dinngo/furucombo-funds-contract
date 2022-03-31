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
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('3000');

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
  let tokenA: IERC20;
  let tokenB: IERC20;
  let shareToken: ShareToken;

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
      });
    });
    describe('purchase asset fund', function () {
      const swapAmount = purchaseAmount.div(2);

      beforeEach(async function () {
        await setExecutingAssetFund(
          manager,
          investor,
          fundProxy,
          denomination,
          shareToken,
          purchaseAmount,
          swapAmount,
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );
      });
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
          execFeePercentage,
          denominationAddress,
          tokenAAddress,
          path,
          tos,

          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        const expectedShare = await fundProxy.calculateShare(purchaseAmount);
        const [share, state] = await purchaseFund(manager, fundProxy, denomination, shareToken, purchaseAmount);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
        expect(BigNumber.from(share)).to.be.eq(expectedShare);
      });
    });
  });

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
    });
  });
});
