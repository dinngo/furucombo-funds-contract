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
  HQuickSwap,
} from '../../typechain';

import { mwei, impersonateAndInjectEther } from '../utils/utils';

import {
  createFund,
  redeemFund,
  setOperatingDenominationFund,
  setOperatingAssetFund,
  setObservingAssetFund,
  setClosedDenominationFund,
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
} from '../utils/constants';

describe('InvestorPurchaseFund', function () {
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
  const stakeAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY;
  const crystallizationPeriod = 300; // 5m
  const reserveExecution = 0; // 0%
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = mwei('2000');
  const swapAmount = purchaseAmount.div(2);

  const shareTokenName = 'TEST';

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let poolProxy: PoolImplementation;
  let poolVault: string;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
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
        ,
        ,
        ,
        ,
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
        reserveExecution,
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
  //add check vault balance
  describe('State Changes', function () {
    describe('redeem operating and stay in operating', function () {
      describe('redeem operating denomination fund', function () {
        beforeEach(async function () {
          await setOperatingDenominationFund(
            investor,
            poolProxy,
            denomination,
            shareToken,
            purchaseAmount
          );
        });
        it('stay in operation', async function () {
          const shareAmount = await shareToken.balanceOf(investor.address);
          const [balance, state] = await redeemFund(
            investor,
            poolProxy,
            denomination,
            shareAmount,
            acceptPending
          );
          const afterShareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(POOL_STATE.EXECUTING);
          expect(balance).to.be.eq(purchaseAmount);
          expect(afterShareAmount).to.be.eq(0);
        });
      });

      // fund owns assets
      describe('redeem operating asset fund', function () {
        const reserveAmount = purchaseAmount.sub(swapAmount);

        beforeEach(async function () {
          await setOperatingAssetFund(
            manager,
            investor,
            poolProxy,
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
        });

        it('stay in operation when redeem succeeds', async function () {
          const redeemShare = reserveAmount.div(2);
          const expectedShareAmount = purchaseAmount.sub(redeemShare);
          const [, expectedBalance] =
            await poolProxy.calculateRedeemableBalance(redeemShare);
          const [balance, state] = await redeemFund(
            investor,
            poolProxy,
            denomination,
            redeemShare,
            acceptPending
          );
          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(POOL_STATE.EXECUTING);
          expect(expectedBalance.eq(BigNumber.from(balance))).to.be.true;
          expect(shareAmount).to.be.eq(expectedShareAmount);
        });
        it('should revert: not accept pending', async function () {
          const redeemAmount = purchaseAmount;
          let acceptPending: any;
          acceptPending = false;

          await expect(
            poolProxy.connect(investor).redeem(redeemAmount, acceptPending)
          ).to.be.revertedWith('revertCode(70)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
        });
      });
    });

    describe('redeem operating and turns to observing', function () {
      // fund with assets
      describe('redeem operating asset fund', function () {
        beforeEach(async function () {
          await setOperatingAssetFund(
            manager,
            investor,
            poolProxy,
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
        });

        it('turn to observing when redeem finish', async function () {
          const redeemAmount = purchaseAmount;
          const acceptPending = true;
          const [, expectedBalance] =
            await poolProxy.calculateRedeemableBalance(redeemAmount);
          const [balance, state] = await redeemFund(
            investor,
            poolProxy,
            denomination,
            redeemAmount,
            acceptPending
          );

          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(POOL_STATE.REDEMPTION_PENDING);
          expect(expectedBalance.eq(BigNumber.from(balance))).to.be.true;
          expect(shareAmount).to.be.eq(0);
        });
      });
    });
    describe('redeem observing and stay in observing', function () {
      describe('redeem observing asset fund', function () {
        const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('100'));
        const acceptPending = true;

        beforeEach(async function () {
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
        });

        it('should stay in observing when redeem finish', async function () {
          const _redeemAmount = mwei('500');
          const expectedShareAmount = purchaseAmount
            .sub(redeemAmount)
            .sub(_redeemAmount);

          const [, expectedBalance] =
            await poolProxy.calculateRedeemableBalance(_redeemAmount);
          const [balance, state] = await redeemFund(
            investor,
            poolProxy,
            denomination,
            _redeemAmount,
            acceptPending
          );

          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(POOL_STATE.REDEMPTION_PENDING);
          expect(expectedBalance.eq(BigNumber.from(balance))).to.be.true;
          expect(shareAmount).to.be.eq(expectedShareAmount);
        });
      });
    });
  });
  describe('redeem in closed fund', function () {
    it('vault denomination decreases when user redeems', async function () {
      const redeemAmount = await setClosedDenominationFund(
        manager,
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
      const initBalance = await denomination.balanceOf(poolVault);

      await redeemFund(
        investor,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      const afterBalance = await denomination.balanceOf(poolVault);

      expect(afterBalance).to.be.eq(initBalance.sub(purchaseAmount));
    });
    it('user get the right amount of denomination back when redeem full', async function () {
      const initBalance = await denomination.balanceOf(investor.address);

      const redeemAmount = await setClosedDenominationFund(
        manager,
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
      await redeemFund(
        investor,
        poolProxy,
        denomination,
        redeemAmount,
        acceptPending
      );

      const afterBalance = await denomination.balanceOf(investor.address);

      expect(afterBalance).to.be.eq(initBalance);
    });
    //TODO: check again after pending list MR
    it.skip('redeem the same amount before/after claimPending', async function () {});
  });
  // TODO: redeem in different states?
});
