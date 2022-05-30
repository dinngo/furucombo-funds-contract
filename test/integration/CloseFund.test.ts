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

import { mwei, impersonateAndInjectEther, increaseNextBlockTimeBy, ether } from '../utils/utils';
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
  MINIMUM_SHARE,
  FUND_PERCENTAGE_BASE,
  BAT_PROVIDER,
} from '../utils/constants';

describe('CloseFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let mortgageProvider: Signer;

  const denominationProviderAddress = USDC_PROVIDER;
  const mortgageProviderAddress = BAT_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = ether('10');
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m

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
  let mortgage: IERC20;

  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);
    mortgageProvider = await impersonateAndInjectEther(mortgageProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [
      fundProxy,
      ,
      denomination,
      shareToken,
      taskExecutor,
      aFurucombo,
      hFunds,
      tokenA,
      ,
      oracle,
      ,
      ,
      hQuickSwap,
      ,
      mortgage,
    ] = await createReviewingFund(
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

    // Transfer denomination to investors
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);

    // Transfer mortgage to manager
    await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);

    // Approve mortgage to fund proxy
    await mortgage.connect(manager).approve(fundProxy.address, mortgageAmount);
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
        'RevertCode(62)' // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      );
    });

    it('should revert: in pending', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
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
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
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
        oracle,
        hQuickSwap,
        pendingExpiration
      );

      await expect(fundProxy.connect(manager).close()).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: by liquidator in liquidating with assets but exceeds oracle stale period ', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
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
        oracle,
        hQuickSwap,
        pendingExpiration
      );
      const exceedOracleStalePeriod = pendingExpiration * 2;
      await increaseNextBlockTimeBy(exceedOracleStalePeriod);
      await expect(fundProxy.connect(liquidator).close()).to.be.revertedWith(
        'RevertCode(45)' // CHAINLINK_STALE_PRICE
      );
    });

    it('should revert: by liquidator in liquidating with assets within redeem share left', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
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
        oracle,
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
        oracle,
        hQuickSwap,
        pendingExpiration
      );

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
        'RevertCode(62)' // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      );
    });
  });

  describe('success', function () {
    it('by manager in executing without any asset', async function () {
      // Init env.
      const purchaseAmount = initialFunds;
      await fundProxy.connect(manager).finalize();
      const beforeBalance = await mortgage.balanceOf(manager.address);
      await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // Close fund
      await fundProxy.connect(manager).close();

      // Verify State
      const afterBalance = await mortgage.balanceOf(manager.address);

      expect(afterBalance.sub(beforeBalance)).to.be.eq(mortgageAmount);
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
    });

    it('by liquidator in liquidating with assets', async function () {
      const purchaseAmount = initialFunds;
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
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
        oracle,
        hQuickSwap,
        pendingExpiration
      );

      // Get pendingRoundList length
      const pendingRoundListLengthBefore = await fundProxy.currentPendingRound();

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

      // Close fund
      const beforeBalance = await mortgage.balanceOf(liquidator.address);
      await fundProxy.connect(liquidator).close();
      const afterBalance = await mortgage.balanceOf(liquidator.address);

      // Verify states
      const pendingRoundListLengthAfter = await fundProxy.currentPendingRound();
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);
      expect(afterBalance.sub(beforeBalance)).to.be.eq(mortgageAmount);
      expect(pendingRoundListLengthAfter.sub(pendingRoundListLengthBefore)).to.be.eq(1);
    });
  });
});
