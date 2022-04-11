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
  Chainlink,
  HQuickSwap,
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  setPendingAssetFund,
  setExecutingDenominationFund,
  setExecutingAssetFund,
  execSwap,
  createReviewingFund,
  setLiquidatingAssetFund,
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

describe('CloseFund', function () {
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
  const pendingExpiration = ONE_DAY; // 1 day
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
  let oracle: Chainlink;

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
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, tokenA, , oracle, , , hQuickSwap] =
      await createReviewingFund(
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

    // Transfer token to investors
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });
  beforeEach(async function () {
    await setupTest();
  });

  describe('fail', function () {
    it('should revert: in reviewing', async function () {
      await expect(fundProxy.connect(manager).close()).to.be.revertedWith(
        'InvalidState(1)' // REVIEWING
      );
    });
    it('should revert: in executing with assets', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      await fundProxy.connect(manager).finalize();

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
      await expect(fundProxy.connect(manager).close()).to.be.revertedWith(
        'RevertCode(64)' // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      );
    });
    it('should revert: in pending', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;
      await fundProxy.connect(manager).finalize();

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
      await expect(fundProxy.connect(manager).close()).to.be.revertedWith(
        'InvalidState(3)' // PENDING
      );
    });
    it('should revert: by non-manager', async function () {
      await fundProxy.connect(manager).finalize();
      await expect(fundProxy.close()).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert: by non-liquidator in liquidating ', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
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
        hQuickSwap,
        pendingExpiration
      );

      await expect(fundProxy.connect(manager).close()).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert: by liquidator in liquidating with assets but exceeds oracle stale period ', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
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
        hQuickSwap,
        pendingExpiration
      );

      await expect(fundProxy.connect(liquidator).close()).to.be.revertedWith(
        'RevertCode(48)' // CHAINLINK_STALE_PRICE
      );
    });
    it('should revert: by liquidator in liquidating with assets within redeem share left', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
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
        hQuickSwap,
        pendingExpiration
      );

      const stalePeriod = pendingExpiration * 2;
      await oracle.setStalePeriod(stalePeriod);
      expect(await oracle.stalePeriod()).to.be.eq(stalePeriod);

      // will trigger _settlePendingShare > _redeem > _pend()
      await expect(fundProxy.connect(liquidator).close()).to.be.revertedWith(
        'InvalidState(4)' // LIQUIDATING
      );
    });
    it('should revert: by liquidator in liquidating with assets without redeem share left', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(3).mul(2);
      const redeemAmount = purchaseAmount.div(2);
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
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
        hQuickSwap,
        pendingExpiration
      );

      const stalePeriod = pendingExpiration * 2;
      await oracle.setStalePeriod(stalePeriod);
      expect(await oracle.stalePeriod()).to.be.eq(stalePeriod);

      const vault = await fundProxy.vault();
      const tokenAAmount = await tokenA.balanceOf(vault);
      const amountIn = tokenAAmount.div(3);
      const path = [tokenA.address, denomination.address];
      const tos = [hFunds.address, hQuickSwap.address];

      // Swap some asset back to denomination by liquidator
      await execSwap(
        amountIn,
        execFeePercentage,
        tokenA.address,
        denomination.address,
        path,
        tos,
        aFurucombo,
        taskExecutor,
        fundProxy,
        liquidator
      );

      await expect(fundProxy.connect(liquidator).close()).to.be.revertedWith(
        'RevertCode(64)' // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      );
    });
  });

  describe('success', function () {
    it('by manager in executing without any asset', async function () {
      const purchaseAmount = initialFunds;
      await fundProxy.connect(manager).finalize();
      await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
      await fundProxy.connect(manager).close();
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
    });
    it('by liquidator in liquidating without assets', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount;
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
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
        hQuickSwap,
        pendingExpiration
      );

      // Set Chainlink stale period
      const stalePeriod = pendingExpiration * 2;
      await oracle.setStalePeriod(stalePeriod);
      expect(await oracle.stalePeriod()).to.be.eq(stalePeriod);

      const vault = await fundProxy.vault();
      const amountIn = await tokenA.balanceOf(vault);
      const path = [tokenA.address, denomination.address];
      const tos = [hFunds.address, hQuickSwap.address];

      // Swap asset back to denomination by liquidator
      await execSwap(
        amountIn,
        execFeePercentage,
        tokenA.address,
        denomination.address,
        path,
        tos,
        aFurucombo,
        taskExecutor,
        fundProxy,
        liquidator
      );
      await fundProxy.connect(liquidator).close();
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
    });
  });
});
