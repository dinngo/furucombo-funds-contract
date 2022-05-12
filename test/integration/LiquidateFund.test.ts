import { Wallet, Signer, BigNumber, constants } from 'ethers';
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
  FundProxyFactory,
  HQuickSwap,
  Chainlink,
  IUniswapV2Router02,
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  setPendingAssetFund,
  setExecutingDenominationFund,
  createReviewingFund,
  createFundInfra,
  execSwap,
  setLiquidatingAssetFund,
} from './fund';
import { deployFurucomboProxyAndRegistry, createFundProxy } from './deploy';
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
  BAT_PROVIDER,
  MINIMUM_SHARE,
  FUND_PERCENTAGE_BASE,
  QUICKSWAP_ROUTER,
} from '../utils/constants';

describe('LiquidateFund', function () {
  const denominationProviderAddress = USDC_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageProviderAddress = BAT_PROVIDER;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const stakeAmountR = 0;
  const stakeAmountS = mwei('10');

  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 20%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;
  const swapAmount = purchaseAmount.div(2);
  const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
  const shareTokenName = 'TEST';

  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let mortgageProvider: Signer;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let fundProxyFactory: FundProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let oracle: Chainlink;

  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;
  let mortgage: IERC20;
  let shareToken: ShareToken;

  let quickRouter: IUniswapV2Router02;

  const setupFailTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , oracle, , , hQuickSwap] =
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
        stakeAmountR,
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

    // External
    quickRouter = await ethers.getContractAt('IUniswapV2Router02', QUICKSWAP_ROUTER);

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
  });

  const setupSuccessTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    mortgageProvider = await impersonateAndInjectEther(mortgageProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxyFactory, taskExecutor, aFurucombo, hFunds, denomination, tokenA, , mortgage, , oracle, , , hQuickSwap] =
      await createFundInfra(
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
        stakeAmountS,
        execFeePercentage,
        pendingExpiration,
        valueTolerance,
        fRegistry,
        furucombo
      );

    // External
    quickRouter = await ethers.getContractAt('IUniswapV2Router02', QUICKSWAP_ROUTER);

    // Set oracle stale period
    await oracle.setStalePeriod(pendingExpiration * 2);

    // Transfer mortgage token to manager
    await mortgage.connect(mortgageProvider).transfer(manager.address, stakeAmountS);

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    // Create and finalize furucombo fund
    fundProxy = await createFundProxy(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      shareTokenName
    );
    shareToken = await ethers.getContractAt('ShareToken', await fundProxy.shareToken());
    expect(await fundProxy.state()).to.be.eq(FUND_STATE.REVIEWING);

    // Approve mortgage token to fund proxy
    await mortgage.connect(manager).approve(fundProxy.address, stakeAmountS);
  });

  describe('liquidate fail', function () {
    beforeEach(async function () {
      await setupFailTest();
    });

    it('should revert: in reviewing', async function () {
      await expect(fundProxy.liquidate()).to.be.revertedWith('RevertCode(10)'); // IMPLEMENTATION_PENDING_NOT_START
    });

    it('should revert: in executing', async function () {
      await fundProxy.connect(manager).finalize();
      await expect(fundProxy.liquidate()).to.be.revertedWith('RevertCode(10)'); // IMPLEMENTATION_PENDING_NOT_START
    });

    it('should revert: in pending expiration', async function () {
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
      await expect(fundProxy.liquidate()).to.be.revertedWith('RevertCode(11)'); // IMPLEMENTATION_PENDING_NOT_EXPIRE
    });

    it('should revert: in closed', async function () {
      await fundProxy.connect(manager).finalize();
      await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
      await fundProxy.connect(manager).close();
      await expect(fundProxy.liquidate()).to.be.revertedWith('RevertCode(10)'); // IMPLEMENTATION_PENDING_NOT_START
    });

    it('should revert: in liquidating', async function () {
      await oracle.setStalePeriod(pendingExpiration * 2);
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

      await expect(fundProxy.liquidate()).to.be.revertedWith('RevertCode(10)'); // IMPLEMENTATION_PENDING_NOT_START
    });
  });

  describe('liquidate success', function () {
    beforeEach(async function () {
      await setupSuccessTest();
    });

    it('in pending exceeds pending expiration by owner', async function () {
      await fundProxy.connect(manager).finalize();
      await setLiquidatingAssetFund(
        manager,
        investor,
        manager,
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

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.LIQUIDATING);
      expect(await fundProxy.owner()).to.be.eq(liquidator.address);
    });

    it('in pending exceeds pending expiration by investor', async function () {
      await fundProxy.connect(manager).finalize();

      await setLiquidatingAssetFund(
        manager,
        investor,
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
        oracle,
        hQuickSwap,
        pendingExpiration
      );

      expect(await fundProxy.state()).to.be.eq(FUND_STATE.LIQUIDATING);
      expect(await fundProxy.owner()).to.be.eq(liquidator.address);
    });
  });

  describe('operation in liquidating', function () {
    beforeEach(async function () {
      await setupSuccessTest();
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
    });

    it('execute in liquidating', async function () {
      const fundVault = await fundProxy.vault();
      const amountIn = await tokenA.balanceOf(fundVault);
      const actionAmountIn = amountIn
        .mul(BigNumber.from(FUND_PERCENTAGE_BASE).sub(execFeePercentage))
        .div(FUND_PERCENTAGE_BASE);
      const path = [tokenA.address, denomination.address];
      const tos = [hFunds.address, hQuickSwap.address];

      // Get expect amount out
      const amountOuts = await quickRouter.getAmountsOut(actionAmountIn, path);
      const amountOut = amountOuts[amountOuts.length - 1];
      const denominationBalanceBefore = await denomination.balanceOf(fundVault);

      // Execute strategy in liquidating
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

      // check denomination will decrease and token will increase
      expect(await denomination.balanceOf(fundVault)).to.be.eq(denominationBalanceBefore.add(amountOut));
    });

    it('should revert: not allow to settle in liquidating', async function () {
      const fundVault = await fundProxy.vault();
      const amountIn = await tokenA.balanceOf(fundVault);
      const actionAmountIn = amountIn
        .mul(BigNumber.from(FUND_PERCENTAGE_BASE).sub(execFeePercentage))
        .div(FUND_PERCENTAGE_BASE);
      const path = [tokenA.address, denomination.address];
      const tos = [hFunds.address, hQuickSwap.address];

      // Get expect amount out
      const amountOuts = await quickRouter.getAmountsOut(actionAmountIn, path);
      const amountOut = amountOuts[amountOuts.length - 1];
      const denominationBalanceBefore = await denomination.balanceOf(fundVault);

      // Execute strategy in liquidating
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

      // check denomination will decrease and token will increase
      expect(await denomination.balanceOf(fundVault)).to.be.eq(denominationBalanceBefore.add(amountOut));
      await expect(fundProxy.connect(liquidator).resume()).to.be.revertedWith('InvalidState(4)');
    });
  });
});
