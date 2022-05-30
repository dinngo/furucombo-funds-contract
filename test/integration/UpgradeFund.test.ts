import { Wallet, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';
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
  UpgradeableBeacon,
  ComptrollerImplementation,
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';
import { createFund, setPendingAssetFund, setExecutingAssetFund } from './fund';
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
  FUND_PERCENTAGE_BASE,
  FUND_STATE,
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
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementation;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  describe('Upgrade fund implementation', function () {
    const purchaseAmount = mwei('2000');
    const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, investor, manager, liquidator] = await (ethers as any).getSigners();

      // Setup tokens and providers
      denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

      // Deploy furucombo funds contracts
      [fundProxy, , denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , , comptroller, , hQuickSwap, ,] =
        await createFund(
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

    beforeEach(async function () {
      await setupTest();
    });

    describe('Pending state', function () {
      const swapAmount = purchaseAmount.div(2);
      const reserveAmount = purchaseAmount.sub(swapAmount);
      const redeemAmount = reserveAmount.add(mwei('500'));

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

      it('same state after upgrade', async function () {
        let beacon: UpgradeableBeacon;

        // Get states before upgrading fund
        const currentTotalPendingShareBefore = await fundProxy.currentTotalPendingShare();
        const currentTotalPendingBonusBefore = await fundProxy.currentTotalPendingBonus();
        const pendingRoundListLengthBefore = await fundProxy.currentPendingRound();
        const pendingUserInfoBefore = await fundProxy.pendingUsers(investor.address);

        // Deploy a new fund implementation
        const newFundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
        await newFundImplementation.deployed();

        // Upgrade fund implementation
        const beaconAddress = await comptroller.beacon();
        beacon = await (await ethers.getContractFactory('UpgradeableBeacon')).attach(beaconAddress);
        await expect(await beacon.upgradeTo(newFundImplementation.address))
          .to.emit(beacon, 'Upgraded')
          .withArgs(newFundImplementation.address);

        // Get states after upgrading fund
        const currentTotalPendingShareAfter = await fundProxy.currentTotalPendingShare();
        const currentTotalPendingBonusAfter = await fundProxy.currentTotalPendingBonus();
        const pendingRoundListLengthAfter = await fundProxy.currentPendingRound();
        const afterPendingUserInfo = await fundProxy.pendingUsers(investor.address);

        // Verify state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(currentTotalPendingShareAfter).to.be.eq(currentTotalPendingShareBefore);
        expect(currentTotalPendingBonusAfter).to.be.eq(currentTotalPendingBonusBefore);
        expect(pendingRoundListLengthAfter).to.be.eq(pendingRoundListLengthBefore);
        expect(afterPendingUserInfo).to.be.deep.eq(pendingUserInfoBefore);
      });
    });

    describe('Executing state', function () {
      const swapAmount = purchaseAmount.div(2);
      const reserveAmount = purchaseAmount.sub(swapAmount);

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
          tokenBAddress,
          hFunds,
          aFurucombo,
          taskExecutor,
          hQuickSwap
        );
      });

      it('same state after upgrade', async function () {
        let beacon: UpgradeableBeacon;

        // Get states before upgrading fund
        const [shareLeftBefore, redeemableBalanceBefore] = await fundProxy.calculateRedeemableBalance(purchaseAmount);

        // Deploy a new fund implementation
        const newFundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
        await newFundImplementation.deployed();

        // Upgrade fund implementation
        const beaconAddress = await comptroller.beacon();
        beacon = await (await ethers.getContractFactory('UpgradeableBeacon')).attach(beaconAddress);
        await expect(await beacon.upgradeTo(newFundImplementation.address))
          .to.emit(beacon, 'Upgraded')
          .withArgs(newFundImplementation.address);

        // Get states after upgrading fund
        const [shareLeftAfter, redeemableBalanceAfter] = await fundProxy.calculateRedeemableBalance(purchaseAmount);

        // Verify state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
        expect(redeemableBalanceAfter).to.be.eq(redeemableBalanceBefore);
        expect(redeemableBalanceAfter).to.be.eq(reserveAmount);
        expect(shareLeftAfter).to.be.eq(shareLeftBefore);
      });
    });
  });
});
