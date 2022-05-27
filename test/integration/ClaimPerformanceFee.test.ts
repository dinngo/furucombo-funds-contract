import { Wallet, Signer, BigNumber } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';
import {
  FurucomboRegistry,
  FurucomboProxy,
  FundImplementationMock,
  IERC20,
  ShareToken,
  FundProxyFactory,
  HFunds,
  AFurucombo,
  TaskExecutor,
  HQuickSwap,
  Chainlink,
} from '../../typechain';

import { expectEqWithinBps, mwei, impersonateAndInjectEther, increaseNextBlockTimeBy, ether } from '../utils/utils';
import {
  purchaseFund,
  redeemFund,
  createMockFundInfra,
  setPendingAssetFund,
  execSwap,
  setExecutingDenominationFund,
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
  FUND_PERCENTAGE_BASE,
  OUTSTANDING_ACCOUNT,
  ONE_DAY,
  FUND_STATE,
  DAI_PROVIDER,
  MINIMUM_SHARE,
  OMG_PROVIDER,
  OMG_TOKEN,
} from '../utils/constants';

describe('ManagerClaimPerformanceFee', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let tokenAProvider: Signer;

  const denominationProviderAddress = USDC_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAProviderAddress = DAI_PROVIDER;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const execFeePercentage = 0; // 0%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const shareTokenName = 'TEST';
  const acceptPending = false;

  const initialFunds = mwei('3000');
  const purchaseAmount = initialFunds;

  const outstandingAccount = OUTSTANDING_ACCOUNT;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let fundProxyFactory: FundProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let fundProxy: FundImplementationMock;
  let oracle: Chainlink;
  let hQuickSwap: HQuickSwap;

  let denomination: IERC20;
  let tokenA: IERC20;
  let shareToken: ShareToken;

  const setupEachTestP0 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = 0;

    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });

  const setupEachTestP1 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = FUND_PERCENTAGE_BASE * 0.01;

    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });

  const setupEachTestP99 = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    await _preCreateFundProxyMock();

    const pFeeRate = FUND_PERCENTAGE_BASE * 0.99;
    // Create and finalize furucombo fund
    fundProxy = await createFundProxyMock(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      shareTokenName
    );

    await _postCreateFundProxyMock();
  });

  async function claimPFee(claimer: Wallet): Promise<BigNumber> {
    // claim pFee
    const pFeeBefore = await shareToken.balanceOf(claimer.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(claimer).crystallize();
    const pFeeAfter = await shareToken.balanceOf(claimer.address);
    return pFeeAfter.sub(pFeeBefore);
  }

  describe('in executing', function () {
    const acceptPending = false;

    describe('0% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP0();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('deduct 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(investor, purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows + user fully redeem', async function () {
        const [pFee] = await _assetValueGrowTest(0);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows + user partially redeem', async function () {
        const [pFee] = await _assetValueGrowTestII(purchaseAmount, acceptPending, 0);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.eq(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('should revert: still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(65)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });

      it('move 0 fee to outstanding address when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('should revert: claim fee by non-owner', async function () {
        await increaseNextBlockTimeBy(crystallizationPeriod);
        await expect(fundProxy.connect(investor).crystallize()).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('1% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP1();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(investor, purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows + user fully redeem', async function () {
        const feeRate = FUND_PERCENTAGE_BASE * 0.01; // 1%
        const [pFee, expectPFee] = await _assetValueGrowTest(feeRate);
        expectEqWithinBps(pFee, expectPFee, 1);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows + user partially redeem', async function () {
        const feeRate = FUND_PERCENTAGE_BASE * 0.01; // 1%
        const [pFee, expectPFee] = await _assetValueGrowTestII(purchaseAmount, acceptPending, feeRate);
        expectEqWithinBps(pFee, expectPFee, 1);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('should revert: still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(65)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });

      it('move fee to outstanding address only when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));

        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });

    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(purchaseAmount.div(2));
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestII(investor, purchaseAmount, acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows + user fully redeem', async function () {
        const feeRate = FUND_PERCENTAGE_BASE * 0.99; // 99%
        const [pFee, expectPFee] = await _assetValueGrowTest(feeRate);
        expectEqWithinBps(pFee, expectPFee, 1);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows + user partially redeem', async function () {
        const feeRate = FUND_PERCENTAGE_BASE * 0.99; // 99%
        const [pFee, expectPFee] = await _assetValueGrowTestII(purchaseAmount, acceptPending, feeRate);
        expectEqWithinBps(pFee, expectPFee, 1);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(purchaseAmount.div(2));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim the same fee when receive unexpected asset in vault', async function () {
        let unexpectedToken: IERC20;
        const unexpectedTokenProviderAddress = OMG_PROVIDER;
        unexpectedToken = await ethers.getContractAt('IERC20', OMG_TOKEN);

        await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

        // claim pFee
        await claimPFee(manager);
        const beforeShare = await shareToken.balanceOf(manager.address);

        // transfer unexpected token
        let unexpectedTokenProvider = await impersonateAndInjectEther(unexpectedTokenProviderAddress);
        const vaultAddr = await fundProxy.vault();
        const donateAmount = ether('10');
        await unexpectedToken.connect(unexpectedTokenProvider).transfer(vaultAddr, donateAmount);

        // claim pFee
        await claimPFee(manager);
        const afterShare = await shareToken.balanceOf(manager.address);

        expect(afterShare).to.be.eq(beforeShare);
      });

      it('should revert: still in crystallization period', async function () {
        await _crystallizationPeriodTest(purchaseAmount, acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(65)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });

      it('should revert: gross asset value down to 0', async function () {
        await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

        // asset value declines to 0
        await fundProxy.setGrossAssetValueMock(0);

        // claim pFee
        await increaseNextBlockTimeBy(crystallizationPeriod);
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'panic code 0x12 (Division or modulo division by zero)'
        );
      });

      it('move fee to outstanding address only when user purchase fund', async function () {
        await _tempAddressTest(purchaseAmount.div(2));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });
  });

  describe('in pending', function () {
    const swapAmount = purchaseAmount.div(2);
    const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);
    const acceptPending = true;

    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
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

        // reset pFee first
        await claimPFee(manager);
      });

      it('claim 0 fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestPending(mwei('500'), acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('deduct fee when asset value declines', async function () {
        const pFee = await _assetValueDeclineTestII(mwei('300'));
        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed', async function () {
        const pFee = await _assetValueNotChangedTest(mwei('500'), acceptPending);
        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim 0 fee when asset value is not changed (decline->grow back)', async function () {
        const pFee = await _assetValueNotChangedTestIIPending();
        expect(pFee).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows + user partially redeem', async function () {
        const feeRate = FUND_PERCENTAGE_BASE * 0.99; // 99%
        const [pFee, expectPFee] = await _assetValueGrowTestII(mwei('300'), acceptPending, feeRate);
        expectEqWithinBps(pFee, expectPFee, 1);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
        expect(await shareToken.balanceOf(OUTSTANDING_ACCOUNT)).to.be.eq(0);
      });

      it('claim 0 fee when asset value grows less than last asset ATH value', async function () {
        await _assetValueHighWaterMarkTest(mwei('500'));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('claim fee when asset value grows more than last asset ATH value', async function () {
        const [beforeGrowShare, afterGrowShare] = await _assetValueHighWaterMarkTestII(mwei('500'));
        expect(afterGrowShare).to.be.gt(beforeGrowShare);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });

      it('should revert: still in crystallization period', async function () {
        await _crystallizationPeriodTest(mwei('500'), acceptPending);

        // claim pFee
        await expect(fundProxy.connect(manager).crystallize()).to.be.revertedWith(
          'RevertCode(65)' // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET
        );
      });

      it('move fee to outstanding address when user purchase fund', async function () {
        await _tempAddressTest(mwei('100'));
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.gt(0);
      });
    });
  });

  describe('pending -> executing', function () {
    const swapAmount = purchaseAmount.div(2);
    const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

    describe('99% performance fee', function () {
      beforeEach(async function () {
        await setupEachTestP99();
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
        // reset pFee first
        await claimPFee(manager);
      });

      it('unexpected denomination in vault', async function () {
        const pFee = await _unexpectedDenominationTest(mwei('300'));

        expect(pFee).to.be.gt(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
        expect(await shareToken.balanceOf(outstandingAccount)).to.be.eq(0);
      });
    });
  });

  describe('pending -> liquidating', function () {
    describe('99% performance fee', function () {
      const feeRate = FUND_PERCENTAGE_BASE * 0.99; // 99%
      const swapAmount = purchaseAmount.div(2);
      const redeemAmount = purchaseAmount.sub(MINIMUM_SHARE);

      beforeEach(async function () {
        await setupEachTestP99();
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
        // reset pFee first
        await claimPFee(manager);
      });

      it('claim pFee', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);
        const initAssetValue = await fundProxy.getGrossAssetValue();

        // asset value grows to double
        const afterValue = initAssetValue.mul(2);
        await fundProxy.setGrossAssetValueMock(afterValue);

        // get expected pFee
        const expectPFee = await _getExpectPFee(afterValue, feeRate);

        // Set oracle stale period
        await oracle.setStalePeriod(pendingExpiration * 2);

        // liquidate fund
        await increaseNextBlockTimeBy(pendingExpiration);
        await fundProxy.connect(liquidator).liquidate();
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.LIQUIDATING);

        // verify pFee
        const afterShare = await shareToken.balanceOf(manager.address);
        const pFee = afterShare.sub(beforeShare);
        expectEqWithinBps(pFee, expectPFee, 1);
      });
    });
  });

  describe('executing -> closed', function () {
    describe('99% performance fee', function () {
      const feeRate = FUND_PERCENTAGE_BASE * 0.99; // 99%

      beforeEach(async function () {
        await setupEachTestP99();
        await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
      });

      it('claim pFee', async function () {
        const beforeShare = await shareToken.balanceOf(manager.address);

        // asset value grows to double
        const initAssetValue = await fundProxy.getGrossAssetValue();
        const afterValue = initAssetValue.mul(2);
        await fundProxy.setGrossAssetValueMock(afterValue);

        // get expected pFee
        const expectPFee = await _getExpectPFee(afterValue, feeRate);

        // close fund to get pFee
        await fundProxy.connect(manager).close();
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);

        // verify pFee
        const afterShare = await shareToken.balanceOf(manager.address);
        const pFee = afterShare.sub(beforeShare);
        expectEqWithinBps(pFee, expectPFee, 1);
      });
    });
  });

  async function _preCreateFundProxyMock() {
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);
    tokenAProvider = await impersonateAndInjectEther(tokenAProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxyFactory, taskExecutor, aFurucombo, hFunds, denomination, tokenA, , , , hQuickSwap, oracle] =
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
  }

  async function _postCreateFundProxyMock() {
    shareToken = await ethers.getContractAt('ShareToken', await fundProxy.shareToken());

    await fundProxy.connect(manager).finalize();

    // Transfer token to investor
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  }

  async function _assetValueDeclineTest(purchaseAmount: BigNumber, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value declines to half
    await fundProxy.setGrossAssetValueMock(purchaseAmount.div(2));
    await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // redeem all shares
    await fundProxy.setGrossAssetValueMock(MINIMUM_SHARE);

    // claim pFee
    const pFee = await claimPFee(manager);
    return pFee;
  }

  async function _assetValueDeclineTestPending(purchaseAmount: BigNumber, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    const initAssetValue = await fundProxy.getGrossAssetValue();

    // asset value declines to half
    await fundProxy.setGrossAssetValueMock(initAssetValue.div(2));
    await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // update gross asset value for redeem
    await fundProxy.setGrossAssetValueMock(initAssetValue.div(2));

    // claim pFee
    const pFee = await claimPFee(manager);
    return pFee;
  }

  async function _assetValueDeclineTestII(purchaseAmount: any): Promise<any> {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (asset value + ~3000)
    // transfer asset to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    const assetGrowValue = ether('3000');

    // use tokenA to avoid turning the fund back to executing
    await tokenA.connect(tokenAProvider).transfer(vaultAddr, assetGrowValue);
    await fundProxy.connect(manager).addAsset(tokenAAddress);
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value declines to almost zero
    await fundProxy.setGrossAssetValueMock(MINIMUM_SHARE);

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }

  async function _unexpectedDenominationTest(purchaseAmount: any): Promise<any> {
    const initAssetValue = await fundProxy.getGrossAssetValue();
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows (asset value +3000)
    // transfer asset to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    const donateAmount = mwei('3000');
    await denomination.connect(denominationProvider).transfer(vaultAddr, donateAmount);

    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    const swapAmount = mwei('1500');
    await execSwap(
      swapAmount,
      execFeePercentage,
      denomination.address,
      tokenA.address,
      [denomination.address, tokenA.address],
      [hFunds.address, hQuickSwap.address],
      aFurucombo,
      taskExecutor,
      fundProxy,
      manager
    );

    await fundProxy.setGrossAssetValueMock(initAssetValue.add(purchaseAmount.mul(2).add(donateAmount).sub(swapAmount)));

    // claim pFee
    const pFee = await claimPFee(manager);
    return pFee;
  }

  async function _assetValueNotChangedTest(purchaseAmount: any, acceptPending: any): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // claim pFee
    const pFee = await claimPFee(manager);
    return pFee;
  }

  async function _assetValueNotChangedTestII(
    investor: Wallet,
    purchaseAmount: BigNumber,
    acceptPending: any
  ): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    const initAssetValue = await fundProxy.getGrossAssetValue();

    // asset value declines to half
    await fundProxy.setGrossAssetValueMock(initAssetValue.div(2));

    // redeem half of share
    const [balance] = await redeemFund(investor, fundProxy, denomination, share.div(2), acceptPending);

    // asset value grows back to initial value
    const afterBalance = initAssetValue.sub(balance.mul(2));
    await fundProxy.setGrossAssetValueMock(afterBalance);

    // redeem another half of share
    const [balanceII] = await redeemFund(investor, fundProxy, denomination, share.div(2), acceptPending);

    await fundProxy.setGrossAssetValueMock(afterBalance.sub(balanceII));

    // claim pFee
    const beforeShare = await shareToken.balanceOf(manager.address);
    await increaseNextBlockTimeBy(crystallizationPeriod);
    await fundProxy.connect(manager).crystallize();
    const afterShare = await shareToken.balanceOf(manager.address);

    return afterShare.sub(beforeShare);
  }

  async function _assetValueNotChangedTestIIPending(): Promise<any> {
    const initAssetValue = await fundProxy.getGrossAssetValue();
    const beforeShare = await shareToken.balanceOf(manager.address);

    // asset value declines to half
    await fundProxy.setGrossAssetValueMock(initAssetValue.div(2));

    // claim pFee
    await claimPFee(manager);

    // asset value grows back to initial value
    await fundProxy.setGrossAssetValueMock(initAssetValue);

    // claim pFee
    await claimPFee(manager);
    const afterShare = await shareToken.balanceOf(manager.address);
    return afterShare.sub(beforeShare);
  }

  async function _assetValueGrowTest(feeRate: number): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    const initAssetValue = await fundProxy.getGrossAssetValue();

    // transfer denomination to simulate asset grows to double
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, purchaseAmount);
    const afterValue = initAssetValue.mul(2);

    // get expect pfee
    const expectValue = await _getExpectPFee(afterValue, feeRate);
    const [redeemValue] = await redeemFund(investor, fundProxy, denomination, share, acceptPending);

    // The redeemed value should be deducted manually
    await fundProxy.setGrossAssetValueMock(afterValue.sub(redeemValue));

    // claim pFee
    const pFee = await claimPFee(manager);

    return [pFee, expectValue];
  }

  async function _assetValueGrowTestII(purchaseAmount: any, acceptPending: any, feeRate: number): Promise<any> {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
    const initAssetValue = await fundProxy.getGrossAssetValue();

    // asset value grows to double
    const afterValue = initAssetValue.mul(2);
    await fundProxy.setGrossAssetValueMock(afterValue);

    // get expected pFee
    const expectValue = await _getExpectPFee(afterValue, feeRate);

    // redeem fund to update pFee
    const [redeemValue] = await redeemFund(investor, fundProxy, denomination, share.div(2), acceptPending);

    // The redeemed value should be deducted manually
    await fundProxy.setGrossAssetValueMock(afterValue.sub(redeemValue));

    // claim pFee
    const pFee = await claimPFee(manager);

    return [pFee, expectValue];
  }

  async function _getExpectPFee(grossAssetValue: BigNumber, pFeeRate: number): Promise<any> {
    // Deduct the current value by net total share to get the wealth
    // since the starting price is 1
    const netShare = await shareToken.netTotalShare();
    const wealth = grossAssetValue.sub(netShare);
    const expectValue = await _calculateFee(wealth, pFeeRate);
    return expectValue;
  }

  async function _calculateFee(wealth: any, feeRate: number): Promise<any> {
    const fee = wealth.mul(feeRate).div(FUND_PERCENTAGE_BASE);
    const gav = await fundProxy.getGrossAssetValue();
    const totalShare = await shareToken.grossTotalShare();
    return totalShare.mul(fee).div(gav.sub(fee));
  }

  async function _assetValueHighWaterMarkTest(purchaseAmount: any) {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows +3000
    // transfer denomination to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, initialFunds);

    // claim pFee
    await claimPFee(manager);
    const share1 = await shareToken.balanceOf(manager.address);

    // asset value declines to 1000
    await fundProxy.setGrossAssetValueMock(mwei('1000'));

    // claim pFee
    await claimPFee(manager);
    const share2 = await shareToken.balanceOf(manager.address);
    expect(share2).to.be.eq(share1);

    // asset value grows (price: 1000 -> 3000)
    await fundProxy.setGrossAssetValueMock(mwei('3000'));

    // claim pFee
    await claimPFee(manager);
    const share3 = await shareToken.balanceOf(manager.address);

    expect(share3).to.be.eq(share2);
  }

  async function _assetValueHighWaterMarkTestII(purchaseAmount: any): Promise<any> {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows +3000
    // transfer denomination to simulate asset grow
    const vaultAddr = await fundProxy.vault();
    await denomination.connect(denominationProvider).transfer(vaultAddr, initialFunds);

    // claim pFee
    await claimPFee(manager);
    const share1 = await shareToken.balanceOf(manager.address);

    // asset value declines to 1000
    await fundProxy.setGrossAssetValueMock(mwei('1000'));

    // claim pFee
    await claimPFee(manager);
    const beforeGrowShare = await shareToken.balanceOf(manager.address);
    expect(beforeGrowShare).to.be.eq(share1);

    // asset value grows to 6000
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    // claim pFee
    await claimPFee(manager);
    const afterGrowShare = await shareToken.balanceOf(manager.address);

    return [beforeGrowShare, afterGrowShare];
  }

  async function _crystallizationPeriodTest(purchaseAmount: any, acceptPending: any) {
    const [share] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows to 6000
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    // trigger _updatePerformance
    await redeemFund(investor, fundProxy, denomination, share.div(2), acceptPending);
  }

  async function _tempAddressTest(purchaseAmount: any) {
    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

    // asset value grows to 6000
    await fundProxy.setGrossAssetValueMock(mwei('6000'));

    await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  }
});
