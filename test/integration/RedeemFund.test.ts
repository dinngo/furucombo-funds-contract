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

import {
  createFund,
  redeemFund,
  setExecutingDenominationFund,
  setExecutingAssetFund,
  setPendingAssetFund,
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
  FUND_STATE,
  ONE_DAY,
  MINIMUM_SHARE,
  FUND_PERCENTAGE_BASE,
} from '../utils/constants';

describe('InvestorRedeemFund', function () {
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
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY;
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = mwei('2000');
  const swapAmount = purchaseAmount.div(2);

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementation;
  let fundVault: string;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let shareToken: ShareToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxy, fundVault, denomination, shareToken, taskExecutor, aFurucombo, hFunds, , , , , , hQuickSwap] =
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

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
  });
  beforeEach(async function () {
    await setupTest();
  });
  //add check vault balance
  describe('State Changes', function () {
    describe('redeem executing and stay in executing', function () {
      describe('redeem executing denomination fund', function () {
        beforeEach(async function () {
          await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
        });
        it('stay in executing', async function () {
          const shareAmount = await shareToken.balanceOf(investor.address);
          const [balance, state] = await redeemFund(investor, fundProxy, denomination, shareAmount, acceptPending);
          const afterShareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
          expect(balance).to.be.eq(purchaseAmount.sub(MINIMUM_SHARE));
          expect(afterShareAmount).to.be.eq(0);
        });
      });

      // fund owns assets
      describe('redeem executing asset fund', function () {
        // 1000 = 2000 - 1000
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
            tokenAAddress,
            hFunds,
            aFurucombo,
            taskExecutor,
            hQuickSwap
          );
        });

        it('stay in executing when redeem succeeds', async function () {
          // 500 = 1000/2
          const redeemShare = reserveAmount.div(2);
          const expectedShareAmount = purchaseAmount.sub(MINIMUM_SHARE).sub(redeemShare);
          const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(redeemShare);
          const [balance, state] = await redeemFund(investor, fundProxy, denomination, redeemShare, acceptPending);
          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(FUND_STATE.EXECUTING);
          expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
          expect(shareAmount).to.be.eq(expectedShareAmount);
        });
        it('should revert: not accept pending', async function () {
          const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
          let acceptPending: any;
          acceptPending = false;

          await expect(fundProxy.connect(investor).redeem(redeemAmount, acceptPending)).to.be.revertedWith(
            'RevertCode(74)'
          ); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
        });
      });
    });

    describe('redeem executing and turns to pending', function () {
      // fund with assets
      describe('redeem executing asset fund', function () {
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
            tokenAAddress,
            hFunds,
            aFurucombo,
            taskExecutor,
            hQuickSwap
          );
        });

        it('turn to pending when redeem finish', async function () {
          const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
          const acceptPending = true;
          const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(redeemAmount);
          const [balance, state] = await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(FUND_STATE.PENDING);
          expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
          expect(shareAmount).to.be.eq(0);
        });
      });
    });
    describe('redeem pending and stay in pending', function () {
      describe('redeem pending asset fund', function () {
        const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('100'));
        const acceptPending = true;

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

        it('stay in pending when redeem finish', async function () {
          const _redeemAmount = mwei('500');
          const expectedShareAmount = purchaseAmount.sub(MINIMUM_SHARE).sub(redeemAmount).sub(_redeemAmount);

          const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(_redeemAmount);
          const [balance, state] = await redeemFund(investor, fundProxy, denomination, _redeemAmount, acceptPending);

          const shareAmount = await shareToken.balanceOf(investor.address);

          expect(state).to.be.eq(FUND_STATE.PENDING);
          expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
          expect(shareAmount).to.be.eq(expectedShareAmount);
        });
        it('should revert: redeem amount > user balance', async function () {
          const _redeemAmount = purchaseAmount;

          await expect(fundProxy.connect(investor).redeem(_redeemAmount, acceptPending)).to.be.revertedWith(
            'RevertCode(73)'
          ); // SHARE_MODULE_INSUFFICIENT_SHARE
        });
      });
    });
  });
  describe('redeem in closed fund', function () {
    it('vault denomination decreases when user redeems', async function () {
      const redeemAmount = await setClosedDenominationFund(
        manager,
        investor,
        fundProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
      const initBalance = await denomination.balanceOf(fundVault);

      await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

      const afterBalance = await denomination.balanceOf(fundVault);

      expect(afterBalance).to.be.eq(initBalance.sub(purchaseAmount).add(MINIMUM_SHARE));
    });
    it('user get the right amount of denomination back when redeem full', async function () {
      const initBalance = await denomination.balanceOf(investor.address);

      const redeemAmount = await setClosedDenominationFund(
        manager,
        investor,
        fundProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
      await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

      const afterBalance = await denomination.balanceOf(investor.address);

      expect(afterBalance).to.be.eq(initBalance.sub(MINIMUM_SHARE));
    });
    //TODO: check again after pending list MR
    it.skip('redeem the same amount before/after claimPending', async function () {});
  });
  // TODO: redeem in different states?
});
