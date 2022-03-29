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
  Chainlink,
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
  let oracle: Chainlink;

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
        oracle,
        comptrollerProxy,
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

  describe('oracle settings', function () {
    it('add and remove assets', async function () {
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

      await oracle.removeAssets([tokenA.address]);
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
        'revertCode(44)' // CHAINLINK_ZERO_ADDRESS
      );

      // permit
      await oracle.addAssets([tokenA.address], [tokenAAggregator]);

      await poolProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(poolVault)).to.be.eq(0);
    });
  });
});
