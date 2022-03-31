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

import { purchaseFund, createReviewingFund, getSwapData } from './fund';
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
  const valueTolerance = 0;
  const pendingExpiration = ONE_DAY;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;

  const shareTokenName = 'TEST';
  let fundVault: string;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let comptrollerProxy: ComptrollerImplementation;

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
  });
  beforeEach(async function () {
    await setupTest();
  });

  describe('comptroller settings', function () {
    const dust = BigNumber.from('10');

    it('permit & forbid denomination', async function () {
      await comptrollerProxy.forbidDenominations([denomination.address]);
      await expect(fundProxy.connect(manager).finalize()).to.be.revertedWith(
        'RevertCode(12)' //IMPLEMENTATION_INVALID_DENOMINATION
      );

      await comptrollerProxy.permitDenominations([denomination.address], [dust]);

      await fundProxy.connect(manager).finalize();
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
    });
    it('ban & unban fundProxy', async function () {
      // ban fund proxy
      await comptrollerProxy.banFundProxy(fundProxy.address);
      await expect(comptrollerProxy.connect(fundProxy.address).implementation()).to.be.revertedWith('RevertCode(1)'); //COMPTROLLER_BANNED

      // unban fund proxy
      await comptrollerProxy.unbanFundProxy(fundProxy.address);
      expect(await comptrollerProxy.connect(fundProxy.address).implementation()).to.be.eq(
        await comptrollerProxy.implementation()
      );
    });
    it('halt and unhalt', async function () {
      // halt
      await comptrollerProxy.halt();
      await expect(comptrollerProxy.connect(fundProxy.address).implementation()).to.be.revertedWith('RevertCode(0)'); //COMPTROLLER_HALTED

      // unhalt
      await comptrollerProxy.unHalt();
      expect(await comptrollerProxy.connect(fundProxy.address).implementation()).to.be.eq(
        await comptrollerProxy.implementation()
      );
    });
    it('permit and forbid asset', async function () {
      await fundProxy.connect(manager).finalize();
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

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
      await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith(
        'RevertCode(33)' //TASK_EXECUTOR_INVALID_DEALING_ASSET
      );

      // permit
      await comptrollerProxy.permitAssets(level, [tokenA.address]);
      await fundProxy.connect(manager).execute(data);

      expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
    });
    it('permit and forbid delegate calls', async function () {
      await fundProxy.connect(manager).finalize();
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // forbid
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];

      await comptrollerProxy.forbidDelegateCalls(level, [aFurucombo.address], [WL_ANY_SIG]);
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
      await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith(
        'RevertCode(31)' //TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
      );

      // permit
      await comptrollerProxy.permitDelegateCalls(level, [aFurucombo.address], [WL_ANY_SIG]);

      await fundProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
    });
    // TODO: check again to find out the scenario
    it.skip('permit and forbid contract calls', async function () {});
    it('permit and forbid handlers', async function () {
      await fundProxy.connect(manager).finalize();
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // forbid
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];

      await comptrollerProxy.forbidHandlers(level, [hFunds.address], [WL_ANY_SIG]);
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
      await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith(
        'RevertCode(41)' //AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL
      );

      // permit
      await comptrollerProxy.permitHandlers(level, [hFunds.address], [WL_ANY_SIG]);

      await fundProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
    });
  });
});
