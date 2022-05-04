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
  purchaseFund,
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
  let user0: Wallet, user1: Wallet, user2: Wallet, user3: Wallet, user4: Wallet;

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

  const initialFunds = mwei('6000');
  const purchaseAmount = mwei('4000');
  const swapAmount = initialFunds.div(2);

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
    [owner, collector, manager, user0, user1, user2, user3, user4, liquidator] = await (ethers as any).getSigners();

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

    // Transfer token to users
    await denomination.connect(denominationProvider).transfer(user0.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user1.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user2.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(user3.address, initialFunds);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Without state change', function () {
    const acceptPending = false;
    describe('Executing state', function () {
      let eachUserShares: BigNumber, eachUserSharesDouble: BigNumber;
      let totalShare: BigNumber;
      beforeEach(async function () {
        const [user0Share] = await purchaseFund(user0, fundProxy, denomination, shareToken, initialFunds);
        totalShare = user0Share;
        eachUserShares = totalShare.div(6);
        eachUserSharesDouble = eachUserShares.mul(2);
        await shareToken.connect(user0).transfer(user1.address, eachUserShares);
        await shareToken.connect(user0).transfer(user2.address, eachUserShares);
        await shareToken.connect(user0).transfer(user3.address, eachUserSharesDouble);

        const user1Share = await shareToken.balanceOf(user1.address);
        console.log('eachUserShares:' + eachUserShares.toString());
        console.log('eachUserSharesDouble:' + eachUserSharesDouble.toString());
        console.log('user1Share:' + user1Share.toString());
      });

      it('user1 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);

        const [user1RedeemAmount, user1State] = await redeemFund(
          user1,
          fundProxy,
          denomination,
          eachUserShares,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);

        const user1Share = await shareToken.balanceOf(user1.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user1Share).to.be.eq(0);
        expect(user1State).to.be.eq(FUND_STATE.EXECUTING);
        // console.log('user1BalanceBefore:' + user1BalanceBefore.toString());
        // console.log('user1BalanceAfter:' + user1BalanceAfter.toString());
        // console.log('balance:' + balance.toString());
        // console.log('user1Share:' + user1Share.toString());
        // console.log('expectedRedeemBalance:' + expectedRedeemBalance.toString());
      });

      it('user1 and user2 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount, user2State] = await redeemFund(
          user2,
          fundProxy,
          denomination,
          eachUserShares,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore.add(user2RedeemAmount));
        expect(user1RedeemAmount).to.be.eq(user2RedeemAmount);
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user2State).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('user1, user2 and user3 redeem', async function () {
        const user1BalanceBefore = await denomination.balanceOf(user1.address);
        const user2BalanceBefore = await denomination.balanceOf(user2.address);
        const user3BalanceBefore = await denomination.balanceOf(user3.address);

        const [user1RedeemAmount] = await redeemFund(user1, fundProxy, denomination, eachUserShares, acceptPending);

        const [user2RedeemAmount] = await redeemFund(user2, fundProxy, denomination, eachUserShares, acceptPending);

        const [user3RedeemAmount, user3State] = await redeemFund(
          user3,
          fundProxy,
          denomination,
          eachUserSharesDouble,
          acceptPending
        );

        const user1BalanceAfter = await denomination.balanceOf(user1.address);
        const user2BalanceAfter = await denomination.balanceOf(user2.address);
        const user3BalanceAfter = await denomination.balanceOf(user3.address);

        const user1Share = await shareToken.balanceOf(user1.address);
        const user2Share = await shareToken.balanceOf(user2.address);
        const user3Share = await shareToken.balanceOf(user3.address);

        expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
        expect(user2BalanceAfter).to.be.eq(user2BalanceBefore.add(user2RedeemAmount));
        expect(user3BalanceAfter).to.be.eq(user3BalanceBefore.add(user3RedeemAmount));
        expect(user1RedeemAmount).to.be.eq(user2RedeemAmount);
        expect(user3RedeemAmount).to.be.eq(user1RedeemAmount.mul(2));
        expect(user1Share).to.be.eq(0);
        expect(user2Share).to.be.eq(0);
        expect(user3Share).to.be.eq(0);
        expect(user3State).to.be.eq(FUND_STATE.EXECUTING);
      });
    }); // describe('Executing state') end

    describe('Pending state', function () {}); // describe('Executing state') end
  }); // describe('Without state change') end

  describe('Claimable pending', function () {
    const acceptPending = false;

    it.only('user1 has claimable pending, user1 redeem', async function () {
      const purchaseAmount = mwei('4000');
      const swapAmount = mwei('3000');
      const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('1000'));

      // makes fund pending
      const user1BalanceBefore = await denomination.balanceOf(user1.address);
      await setPendingAssetFund(
        manager,
        user1,
        fundProxy,
        denomination,
        shareToken,
        purchaseAmount,
        swapAmount,
        redeemAmount,
        execFeePercentage,
        denominationAddress,
        tokenBAddress,
        hFunds,
        aFurucombo,
        taskExecutor,
        hQuickSwap
      );

      // purchase to make to executing
      const [user2Share, user2State] = await purchaseFund(user2, fundProxy, denomination, shareToken, purchaseAmount);
      console.log('user2State:' + user2State);

      // user1 redeem
      const user1ShareBefore = await shareToken.balanceOf(user1.address);
      const [user1RedeemAmount2, user1State2] = await redeemFund(
        user1,
        fundProxy,
        denomination,
        user1ShareBefore,
        acceptPending
      );
      const user1ShareAfter = await shareToken.balanceOf(user1.address);
      const user1BalanceAfter = await denomination.balanceOf(user1.address);

      console.log('user1RedeemAmount2:' + user1RedeemAmount2.toString());

      console.log('user1BalanceBefore:' + user1BalanceBefore.toString());
      console.log('user1BalanceAfter:' + user1BalanceAfter.toString());

      console.log('user1ShareBefore:' + user1ShareBefore.toString());
      console.log('user1ShareAfter:' + user1ShareAfter.toString());

      // expect(user1BalanceAfter).to.be.eq(user1BalanceBefore.add(user1RedeemAmount));
      // expect(user1Share).to.be.eq(0);
      // expect(user1State).to.be.eq(FUND_STATE.EXECUTING);
      // console.log('user1BalanceBefore:' + user1BalanceBefore.toString());
      // console.log('user1BalanceAfter:' + user1BalanceAfter.toString());
      // console.log('balance:' + balance.toString());
      // console.log('user1Share:' + user1Share.toString());
      // console.log('expectedRedeemBalance:' + expectedRedeemBalance.toString());
    });
  });

  describe('State change', function () {
    describe('Executing state', function () {}); // describe('Executing state') end
  }); // describe('Without state change') end

  describe('Dead oracle', function () {});
  //add check vault balance
  // describe('State Changes', function () {
  //   describe('redeem executing and stay in executing', function () {
  //     describe('redeem executing denomination fund', function () {
  //       beforeEach(async function () {
  //         await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  //       });
  //       it('stay in executing', async function () {
  //         const shareAmount = await shareToken.balanceOf(investor.address);
  //         const [balance, state] = await redeemFund(investor, fundProxy, denomination, shareAmount, acceptPending);
  //         const afterShareAmount = await shareToken.balanceOf(investor.address);

  //         expect(state).to.be.eq(FUND_STATE.EXECUTING);
  //         expect(balance).to.be.eq(purchaseAmount.sub(MINIMUM_SHARE));
  //         expect(afterShareAmount).to.be.eq(0);
  //       });
  //     });

  //     // fund owns assets
  //     describe('redeem executing asset fund', function () {
  //       // 1000 = 2000 - 1000
  //       const reserveAmount = purchaseAmount.sub(swapAmount);

  //       beforeEach(async function () {
  //         await setExecutingAssetFund(
  //           manager,
  //           investor,
  //           fundProxy,
  //           denomination,
  //           shareToken,
  //           purchaseAmount,
  //           swapAmount,
  //           execFeePercentage,
  //           denominationAddress,
  //           tokenAAddress,
  //           hFunds,
  //           aFurucombo,
  //           taskExecutor,
  //           hQuickSwap
  //         );
  //       });

  //       it('stay in executing when redeem succeeds', async function () {
  //         // 500 = 1000/2
  //         const redeemShare = reserveAmount.div(2);
  //         const expectedShareAmount = purchaseAmount.sub(MINIMUM_SHARE).sub(redeemShare);
  //         const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(redeemShare);
  //         const [balance, state] = await redeemFund(investor, fundProxy, denomination, redeemShare, acceptPending);
  //         const shareAmount = await shareToken.balanceOf(investor.address);

  //         expect(state).to.be.eq(FUND_STATE.EXECUTING);
  //         expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
  //         expect(shareAmount).to.be.eq(expectedShareAmount);
  //       });
  //       it('should revert: not accept pending', async function () {
  //         const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
  //         let acceptPending: any;
  //         acceptPending = false;

  //         await expect(fundProxy.connect(investor).redeem(redeemAmount, acceptPending)).to.be.revertedWith(
  //           'RevertCode(74)'
  //         ); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
  //       });
  //     });
  //   });

  //   describe('redeem executing and turns to pending', function () {
  //     // fund with assets
  //     describe('redeem executing asset fund', function () {
  //       beforeEach(async function () {
  //         await setExecutingAssetFund(
  //           manager,
  //           investor,
  //           fundProxy,
  //           denomination,
  //           shareToken,
  //           purchaseAmount,
  //           swapAmount,
  //           execFeePercentage,
  //           denominationAddress,
  //           tokenAAddress,
  //           hFunds,
  //           aFurucombo,
  //           taskExecutor,
  //           hQuickSwap
  //         );
  //       });

  //       it('turn to pending when redeem finish', async function () {
  //         const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
  //         const acceptPending = true;
  //         const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(redeemAmount);
  //         const [balance, state] = await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

  //         const shareAmount = await shareToken.balanceOf(investor.address);

  //         expect(state).to.be.eq(FUND_STATE.PENDING);
  //         expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
  //         expect(shareAmount).to.be.eq(0);
  //       });
  //     });
  //   });
  //   describe('redeem pending and stay in pending', function () {
  //     describe('redeem pending asset fund', function () {
  //       const redeemAmount = purchaseAmount.sub(swapAmount).add(mwei('100'));
  //       const acceptPending = true;

  //       beforeEach(async function () {
  //         await setPendingAssetFund(
  //           manager,
  //           investor,
  //           fundProxy,
  //           denomination,
  //           shareToken,
  //           purchaseAmount,
  //           swapAmount,
  //           redeemAmount,
  //           execFeePercentage,
  //           denominationAddress,
  //           tokenAAddress,
  //           hFunds,
  //           aFurucombo,
  //           taskExecutor,
  //           hQuickSwap
  //         );
  //       });

  //       it('stay in pending when redeem finish', async function () {
  //         const _redeemAmount = mwei('500');
  //         const expectedShareAmount = purchaseAmount.sub(MINIMUM_SHARE).sub(redeemAmount).sub(_redeemAmount);

  //         const [, expectedBalance] = await fundProxy.calculateRedeemableBalance(_redeemAmount);
  //         const [balance, state] = await redeemFund(investor, fundProxy, denomination, _redeemAmount, acceptPending);

  //         const shareAmount = await shareToken.balanceOf(investor.address);

  //         expect(state).to.be.eq(FUND_STATE.PENDING);
  //         expect(BigNumber.from(balance)).to.be.eq(expectedBalance);
  //         expect(shareAmount).to.be.eq(expectedShareAmount);
  //       });
  //       it('should revert: redeem amount > user balance', async function () {
  //         const _redeemAmount = purchaseAmount;

  //         await expect(fundProxy.connect(investor).redeem(_redeemAmount, acceptPending)).to.be.revertedWith(
  //           'RevertCode(73)'
  //         ); // SHARE_MODULE_INSUFFICIENT_SHARE
  //       });
  //     });
  //   });
  // });
  // describe('redeem in closed fund', function () {
  //   it('vault denomination decreases when user redeems', async function () {
  //     const redeemAmount = await setClosedDenominationFund(
  //       manager,
  //       investor,
  //       fundProxy,
  //       denomination,
  //       shareToken,
  //       purchaseAmount
  //     );
  //     const initBalance = await denomination.balanceOf(fundVault);

  //     await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

  //     const afterBalance = await denomination.balanceOf(fundVault);

  //     expect(afterBalance).to.be.eq(initBalance.sub(purchaseAmount).add(MINIMUM_SHARE));
  //   });
  //   it('user get the right amount of denomination back when redeem full', async function () {
  //     const initBalance = await denomination.balanceOf(investor.address);

  //     const redeemAmount = await setClosedDenominationFund(
  //       manager,
  //       investor,
  //       fundProxy,
  //       denomination,
  //       shareToken,
  //       purchaseAmount
  //     );
  //     await redeemFund(investor, fundProxy, denomination, redeemAmount, acceptPending);

  //     const afterBalance = await denomination.balanceOf(investor.address);

  //     expect(afterBalance).to.be.eq(initBalance.sub(MINIMUM_SHARE));
  //   });
  //   //TODO: check again after pending list MR
  //   it.skip('redeem the same amount before/after claimPending', async function () {});
  // });
  // TODO: redeem in different states?
});
