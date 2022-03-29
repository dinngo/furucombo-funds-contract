import { Wallet, Signer, BigNumber } from 'ethers';
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

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  createFund,
  purchaseFund,
  setObservingAssetFund,
  setOperatingDenominationFund,
  setOperatingAssetFund,
  execSwap,
  createFundInfra,
  createReviewingFund,
  getSwapData,
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
  POOL_STATE,
  ONE_DAY,
  BAT_PROVIDER,
  WL_ANY_SIG,
} from '../utils/constants';
import { ComptrollerImplementation } from '../../typechain/ComptrollerImplementation';

describe('SetComptroller', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;

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
  const stakeAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;
  const swapAmount = purchaseAmount.div(2);
  const redeemAmount = purchaseAmount;

  const shareTokenName = 'TEST';
  let poolVault: string;

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let poolProxyFactory: PoolProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let mortgageVault: MortgageVault;
  let comptrollerProxy: ComptrollerImplementation;

  let poolProxy: PoolImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;
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
        poolVault,
        denomination,
        shareToken,
        taskExecutor,
        aFurucombo,
        hFunds,
        tokenA,
        ,
        ,
        comptrollerProxy,
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
        stakeAmount,
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
  beforeEach(async function () {
    await setupTest();
  });

  describe('comptroller settings', function () {
    const dust = BigNumber.from('10');

    it('permit & forbid denomination', async function () {
      await comptrollerProxy.forbidDenominations([denomination.address]);
      await expect(poolProxy.connect(manager).finalize()).to.be.revertedWith(
        'revertCode(12)' //IMPLEMENTATION_INVALID_DENOMINATION
      );

      await comptrollerProxy.permitDenominations(
        [denomination.address],
        [dust]
      );

      await poolProxy.connect(manager).finalize();
      expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);
    });
    it('ban & unban poolProxy', async function () {
      await comptrollerProxy.banPoolProxy(poolProxy.address);
      await expect(
        comptrollerProxy.connect(poolProxy.address).implementation()
      ).to.be.revertedWith('revertCode(1)'); //COMPTROLLER_BANNED

      await comptrollerProxy.unbanPoolProxy(poolProxy.address);
      expect(
        await comptrollerProxy.connect(poolProxy.address).implementation()
      ).to.be.eq(await comptrollerProxy.implementation());
    });
    it('halt and unhalt', async function () {
      await comptrollerProxy.halt();
      await expect(
        comptrollerProxy.connect(poolProxy.address).implementation()
      ).to.be.revertedWith('revertCode(0)'); //COMPTROLLER_HALTED

      await comptrollerProxy.unHalt();
      expect(
        await comptrollerProxy.connect(poolProxy.address).implementation()
      ).to.be.eq(await comptrollerProxy.implementation());
    });
    it('permit and forbid asset', async function () {
      await poolProxy.connect(manager).finalize();
      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // forbid
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];

      await comptrollerProxy.forbidAssets(level, [tokenA.address]);
      const data = await getSwapData(
        amountIn,
        execFeePercentage,
        denomination.address,
        tokenA.address,
        path,
        tos,
        aFurucombo,
        taskExecutor
      );
      await expect(poolProxy.connect(manager).execute(data)).to.be.revertedWith(
        'revertCode(33)' //TASK_EXECUTOR_INVALID_DEALING_ASSET
      );

      // permit
      await comptrollerProxy.permitAssets(level, [tokenA.address]);
      await poolProxy.connect(manager).execute(data);

      expect(await denomination.balanceOf(poolVault)).to.be.eq(0);
    });
    it('permit and forbid delegate calls', async function () {
      await poolProxy.connect(manager).finalize();
      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // forbid
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];

      await comptrollerProxy.forbidDelegateCalls(
        level,
        [aFurucombo.address],
        [WL_ANY_SIG]
      );
      const data = await getSwapData(
        amountIn,
        execFeePercentage,
        denomination.address,
        tokenA.address,
        path,
        tos,
        aFurucombo,
        taskExecutor
      );
      await expect(poolProxy.connect(manager).execute(data)).to.be.revertedWith(
        'revertCode(31)' //TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
      );

      // permit
      await comptrollerProxy.permitDelegateCalls(
        level,
        [aFurucombo.address],
        [WL_ANY_SIG]
      );

      await poolProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(poolVault)).to.be.eq(0);
    });
    // TODO: check again to find out the scenario
    it.skip('permit and forbid contract calls', async function () {});
    it('permit and forbid handlers', async function () {
      await poolProxy.connect(manager).finalize();
      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );

      // forbid
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];

      await comptrollerProxy.forbidHandlers(
        level,
        [hFunds.address],
        [WL_ANY_SIG]
      );
      const data = await getSwapData(
        amountIn,
        execFeePercentage,
        denomination.address,
        tokenA.address,
        path,
        tos,
        aFurucombo,
        taskExecutor
      );
      await expect(poolProxy.connect(manager).execute(data)).to.be.revertedWith(
        'revertCode(41)' //AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL
      );

      // permit
      await comptrollerProxy.permitHandlers(
        level,
        [hFunds.address],
        [WL_ANY_SIG]
      );

      await poolProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(poolVault)).to.be.eq(0);
    });
  });
});
