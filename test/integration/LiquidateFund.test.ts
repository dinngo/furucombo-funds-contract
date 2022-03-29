import { Wallet, Signer } from 'ethers';
import { deployments } from 'hardhat';
import { expect } from 'chai';

import {
  Registry,
  FurucomboProxy,
  PoolImplementation,
  IERC20,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ShareToken,
  MortgageVault,
  PoolProxyFactory,
  HQuickSwap,
} from '../../typechain';

import {
  mwei,
  impersonateAndInjectEther,
  increaseNextBlockTimeBy,
} from '../utils/utils';

import {
  setObservingAssetFund,
  setOperatingDenominationFund,
  createReviewingFund,
  createFundInfra,
} from './fund';
import { deployFurucomboProxyAndRegistry, createPoolProxy } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  USDC_PROVIDER,
  POOL_STATE,
  ONE_DAY,
  BAT_PROVIDER,
} from '../utils/constants';

describe('InvestorPurchaseFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let mortgageProvider: Signer;

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
  const execFeePercentage = 200; // 20%
  const pendingExpiration = ONE_DAY;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;
  const swapAmount = purchaseAmount.div(2);
  const redeemAmount = purchaseAmount;

  const shareTokenName = 'TEST';

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let poolProxyFactory: PoolProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let mortgageVault: MortgageVault;

  let poolProxy: PoolImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let mortgage: IERC20;
  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(
        denominationProviderAddress
      );

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [
        poolProxy,
        ,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
        ,
        ,
        ,
        ,
        ,
        hQuickSwap,
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
        stakeAmountR,
        mFeeRate,
        pFeeRate,
        execFeePercentage,
        pendingExpiration,
        crystallizationPeriod,
        reserveExecutionRatio,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);
    }
  );

  const setupSuccessTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(
        denominationProviderAddress
      );

      mortgageProvider = await impersonateAndInjectEther(
        mortgageProviderAddress
      );

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [
        poolProxyFactory,
        taskExecutor,
        aFurucombo,
        hFunds,
        denomination,
        ,
        ,
        mortgage,
        mortgageVault,
        ,
        ,
        ,
        hQuickSwap,
      ] = await createFundInfra(
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
        fRegistry,
        furucombo
      );

      // Transfer mortgage token to manager
      await mortgage
        .connect(mortgageProvider)
        .transfer(manager.address, stakeAmountS);
      await mortgage
        .connect(manager)
        .approve(mortgageVault.address, stakeAmountS);

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      // Create and finalize furucombo fund
      poolProxy = await createPoolProxy(
        poolProxyFactory,
        manager,
        denominationAddress,
        level,
        mFeeRate,
        pFeeRate,
        crystallizationPeriod,
        reserveExecutionRatio,
        shareTokenName
      );
      shareToken = await ethers.getContractAt(
        'ShareToken',
        await poolProxy.shareToken()
      );
      expect(await poolProxy.state()).to.be.eq(POOL_STATE.REVIEWING);
    }
  );

  describe('should revert', function () {
    beforeEach(async function () {
      await setupTest();
    });
    it('in reviewing', async function () {
      await expect(poolProxy.liquidate()).to.be.revertedWith('revertCode(8)');
    });
    it('in executing', async function () {
      await poolProxy.connect(manager).finalize();
      await expect(poolProxy.liquidate()).to.be.revertedWith('revertCode(8)');
    });
    it('in pending expiration', async function () {
      await poolProxy.connect(manager).finalize();

      await setObservingAssetFund(
        manager,
        investor,
        poolProxy,
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
      await expect(poolProxy.liquidate()).to.be.revertedWith('revertCode(9)');
    });
    it('in closed', async function () {
      await poolProxy.connect(manager).finalize();
      await setOperatingDenominationFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
      await poolProxy.connect(manager).close();
      await expect(poolProxy.liquidate()).to.be.revertedWith('revertCode(8)');
    });
  });
  describe('should succeed', function () {
    beforeEach(async function () {
      await setupSuccessTest();
    });
    it('in pending exceeds pending expiration', async function () {
      await poolProxy.connect(manager).finalize();

      await setObservingAssetFund(
        manager,
        investor,
        poolProxy,
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
      const beforeMortgage = await mortgage.balanceOf(owner.address);
      await increaseNextBlockTimeBy(pendingExpiration);
      await poolProxy.liquidate();
      const afterMortgage = await mortgage.balanceOf(owner.address);

      expect(await poolProxy.state()).to.be.eq(POOL_STATE.LIQUIDATING);
      expect(afterMortgage.sub(beforeMortgage)).to.be.eq(stakeAmountS);
      expect(await poolProxy.owner()).to.be.eq(liquidator.address);
    });
  });
});
