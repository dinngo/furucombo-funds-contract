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

import { createFund, purchaseFund, getSwapData } from './fund';
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
  ONE_DAY,
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

  describe('oracle settings', function () {
    it('add and remove assets', async function () {
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // remove asset
      await oracle.removeAssets([tokenA.address]);

      // execute
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];
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
        'RevertCode(44)' // CHAINLINK_ZERO_ADDRESS
      );

      // add asset
      await oracle.addAssets([tokenA.address], [tokenAAggregator]);

      await fundProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
    });

    it('zero stale period', async function () {
      await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

      // set stale period to zero
      await oracle.setStalePeriod(0);

      // execute
      const amountIn = purchaseAmount;
      const path = [denomination.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];
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
        'RevertCode(48)' // CHAINLINK_STALE_PRICE
      );

      // stale period
      await oracle.setStalePeriod(ONE_DAY);

      await fundProxy.connect(manager).execute(data);
      expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
    });
  });
});
