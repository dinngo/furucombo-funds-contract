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
  HQuickSwap,
  ComptrollerImplementation,
  Chainlink,
  FundProxyFactory,
  FundImplementationMock,
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  createFund,
  setPendingAssetFund,
  setExecutingDenominationFund,
  setLiquidatingAssetFund,
  setClosedDenominationFund,
  createMockFundInfra,
  purchaseFund,
} from './fund';

import { deployFurucomboProxyAndRegistry, createFundProxyMock } from './deploy';
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
  FUND_PERCENTAGE_BASE,
  FUND_STATE,
  MINIMUM_SHARE,
} from '../utils/constants';

describe('UpgradeFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let investor: Wallet;

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
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m

  const initialFunds = mwei('6000');

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let comptroller: ComptrollerImplementation;
  let hFunds: HFunds;
  let fundProxyFactory: FundProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementation;
  let fundProxyMock: FundImplementationMock;
  let oracle: Chainlink;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  describe('ResumeFund', function () {
    const purchaseAmount = mwei('2000');
    const swapAmount = purchaseAmount.div(2);
    // const reserveAmount = purchaseAmount.sub(swapAmount);
    const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

    const setupSuccessTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
      [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);
      // tokenAProvider = await impersonateAndInjectEther(tokenAProviderAddress);

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [fundProxyFactory, taskExecutor, aFurucombo, hFunds, denomination /*tokenA*/, , , , , hQuickSwap, oracle] =
        await createMockFundInfra(
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
          execFeePercentage,
          pendingExpiration,
          fRegistry,
          furucombo
        );

      // Create and finalize furucombo fund
      fundProxyMock = await createFundProxyMock(
        fundProxyFactory,
        manager,
        denominationAddress,
        level,
        mFeeRate,
        pFeeRate,
        crystallizationPeriod,
        shareTokenName
      );

      shareToken = await ethers.getContractAt('ShareToken', await fundProxyMock.shareToken());

      await fundProxyMock.connect(manager).finalize();

      // Transfer token to investor
      await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    });

    const setupFailTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, investor, manager, liquidator] = await (ethers as any).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

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
        ,
        ,
        oracle,
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

      // Transfer token to investors
      await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
      await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
    });

    describe('success', function () {
      beforeEach(async function () {
        await setupSuccessTest();
      });

      it('in pending state due to gross asset value decline', async function () {
        // Init env.
        await setPendingAssetFund(
          manager,
          investor,
          fundProxyMock,
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

        // another user purchase fund but not be able to solve pending
        await purchaseFund(manager, fundProxyMock, denomination, shareToken, swapAmount.div(2));
        expect(await fundProxyMock.state()).to.be.eq(FUND_STATE.PENDING);

        await expect(fundProxyMock.resume()).to.be.revertedWith('RevertCode(9)'); // IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE

        // Simulate gross asset value down enough to resolve pending
        await fundProxyMock.setGrossAssetValueMock(MINIMUM_SHARE);

        // Resume fund
        await fundProxyMock.resume();

        // Verify state
        const state = await fundProxyMock.state();
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });
    });

    describe('fail', function () {
      beforeEach(async function () {
        await setupFailTest();
      });

      it('should revert: in pending state due to insufficient reserve', async function () {
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
        await expect(fundProxy.resume()).to.be.revertedWith('RevertCode(9)'); // IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE
      });

      it('should revert: in executing state', async function () {
        await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        await expect(fundProxy.resume()).to.be.revertedWith('InvalidState(2)'); // EXECUTING
      });

      it('should revert: in liquidating state', async function () {
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
        await expect(fundProxy.resume()).to.be.revertedWith('InvalidState(4)'); // LIQUIDATING
      });

      it('should revert: in closed state', async function () {
        await setClosedDenominationFund(manager, investor, fundProxy, denomination, shareToken, purchaseAmount);
        await expect(fundProxy.resume()).to.be.revertedWith('InvalidState(5)'); // CLOSED
      });
    });
  });
});
