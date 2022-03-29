import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
  IERC20,
  Registry,
  FurucomboProxy,
  HFunds,
  AFurucombo,
  TaskExecutor,
  PoolImplementation,
  ShareToken,
  IUniswapV2Router02,
  AssetRouter,
  HQuickSwap,
  HSushiSwap,
  HAaveProtocolV2,
  HCurve,
} from '../../typechain';

import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  QUICKSWAP_ROUTER,
  SUSHISWAP_ROUTER,
  USDC_PROVIDER,
  FEE_BASE,
  POOL_STATE,
  ONE_DAY,
  LINK_TOKEN,
} from '../utils/constants';

import { mwei, impersonateAndInjectEther, ether } from '../utils/utils';

import {
  createFund,
  execSwap,
  purchaseFund,
  getSwapData,
  redeemFund,
} from './fund';

import { deployFurucomboProxyAndRegistry } from './deploy';

describe('PoolExecuteStrategy', function () {
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;
  const denominationProviderAddress = USDC_PROVIDER;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const stakeAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRate = 0; // 0%
  const shareTokenName = 'TEST';

  const initialFunds = mwei('3000');
  const purchaseAmount = mwei('2000');

  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;

  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let shareToken: ShareToken;
  let denominationProvider: Signer;

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;

  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let poolProxy: PoolImplementation;
  let poolVault: string;

  let quickRouter: IUniswapV2Router02;
  let sushiRouter: IUniswapV2Router02;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      // TODO: check again to see if this is necessary
      // denominationProvider = await tokenProviderSushi(denominationAddress);
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
        tokenB,
        ,
        ,
        ,
        hQuickSwap,
        hSushiSwap,
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
        reserveExecutionRate,
        shareTokenName,
        fRegistry,
        furucombo
      );

      // External
      quickRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        QUICKSWAP_ROUTER
      );
      sushiRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        SUSHISWAP_ROUTER
      );

      // Transfer token to investor
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      await purchaseFund(
        investor,
        poolProxy,
        denomination,
        shareToken,
        purchaseAmount
      );
    }
  );
  beforeEach(async function () {
    await setupTest();
  });

  describe('execute strategy in operation', function () {
    // beforeEach(async function () {});

    describe('Router', function () {
      let ownedShares: BigNumber;
      let tokenAPoolVaultBalance: BigNumber;
      let tokenBPoolVaultBalance: BigNumber;
      let denominationProxyBalance: BigNumber;
      let denominationCollectorBalance: BigNumber;

      beforeEach(async function () {
        ownedShares = await shareToken.balanceOf(investor.address);

        tokenAPoolVaultBalance = await tokenA.balanceOf(poolVault);
        tokenBPoolVaultBalance = await tokenB.balanceOf(poolVault);
        denominationProxyBalance = await denomination.balanceOf(poolVault);
        denominationCollectorBalance = await denomination.balanceOf(
          collector.address
        );
      });
      it('quickswap', async function () {
        // Prepare action data
        const amountIn = mwei('1000');

        const actionAmountIn = amountIn
          .mul(BigNumber.from(FEE_BASE).sub(execFeePercentage))
          .div(FEE_BASE);
        const path = [denomination.address, tokenB.address, tokenA.address];
        const tos = [hFunds.address, hQuickSwap.address];

        // Get expect amount out
        const amountOuts = await quickRouter.getAmountsOut(
          actionAmountIn,
          path
        );
        const amountOut = amountOuts[amountOuts.length - 1];

        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );

        // Verify
        // check shares are the same
        expect(ownedShares).to.be.eq(
          await shareToken.balanceOf(investor.address)
        );

        // check denomination will decrease and token will increase
        expect(await tokenA.balanceOf(poolVault)).to.be.eq(
          tokenAPoolVaultBalance.add(amountOut)
        );
        expect(await denomination.balanceOf(poolVault)).to.be.eq(
          denominationProxyBalance.sub(amountIn)
        );

        // check collector will get execute fee
        expect(
          (await denomination.balanceOf(collector.address)).sub(
            denominationCollectorBalance
          )
        ).to.be.eq(amountIn.mul(execFeePercentage).div(FEE_BASE));

        // TODO: check it after refine quickswap handler
        // check asset list will be updated
        // const assetList = await poolProxy.getAssetList();
        // const expectedAssets = [denomination.address].concat(
        //   path.slice(1, path.length)
        // );

        // expect(assetList.length).to.be.eq(expectedAssets.length);
        // for (let i = 0; i < assetList.length; ++i) {
        //   expect(assetList[i]).to.be.eq(expectedAssets[i]);
        // }
      });

      it('sushiswap', async function () {
        // Prepare action data
        const amountIn = mwei('1000');
        const actionAmountIn = amountIn
          .mul(BigNumber.from(FEE_BASE).sub(execFeePercentage))
          .div(FEE_BASE);
        const path = [denomination.address, tokenB.address, tokenA.address];
        const tos = [hFunds.address, hSushiSwap.address];

        // Get expect amount out
        const amountOuts = await sushiRouter.getAmountsOut(
          actionAmountIn,
          path
        );
        const amountOut = amountOuts[amountOuts.length - 1];

        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );

        // Verify
        // check shares are the same
        expect(ownedShares).to.be.eq(
          await shareToken.balanceOf(investor.address)
        );

        // check denomination will decrease and token will increase
        expect(await tokenA.balanceOf(poolVault)).to.be.eq(
          tokenAPoolVaultBalance.add(amountOut)
        );
        expect(await denomination.balanceOf(poolVault)).to.be.eq(
          denominationProxyBalance.sub(amountIn)
        );

        // check collector will get execute fee
        expect(
          (await denomination.balanceOf(collector.address)).sub(
            denominationCollectorBalance
          )
        ).to.be.eq(amountIn.mul(execFeePercentage).div(FEE_BASE));

        // TODO: check it after refine sushiswap handler
        // check asset list will be updated
        // const assetList = await poolProxy.getAssetList();
        // const expectedAssets = [denomination.address].concat(
        //   path.slice(1, path.length)
        // );

        // expect(assetList.length).to.be.eq(expectedAssets.length);
        // for (let i = 0; i < assetList.length; ++i) {
        //   expect(assetList[i]).to.be.eq(expectedAssets[i]);
        // }
      });
    });
    describe('Swap', function () {
      let path: string[];
      let tos: string[];

      beforeEach(async function () {
        path = [denomination.address, tokenA.address];
        tos = [hFunds.address, hQuickSwap.address];
      });

      it('swap with all denomination', async function () {
        const amountIn = purchaseAmount;
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );
        const denominationAmount = await poolProxy.getReserve();
        const state = await poolProxy.state();
        expect(denominationAmount).to.be.eq(0);
        expect(state).to.be.eq(POOL_STATE.EXECUTING);
      });
      it('swap with partial denomination', async function () {
        const amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );
        const denominationAmount = await poolProxy.getReserve();
        const state = await poolProxy.state();
        expect(denominationAmount.eq(purchaseAmount.sub(amountIn))).to.be.true;
        expect(state).to.be.eq(POOL_STATE.EXECUTING);
      });
      it('should revert: swap with 0 denomination', async function () {
        const amountIn = BigNumber.from('0');
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
        await expect(
          poolProxy.connect(manager).execute(data)
        ).to.be.revertedWith(
          'injectAndBatchExec: 1_HQuickSwap_swapExactTokensForTokens: UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT'
        );
      });
      it('resolve pending', async function () {
        const amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );

        const tokenABalance = await tokenA.balanceOf(poolVault);

        const redeemShare = purchaseAmount;
        const acceptPending = true;

        const [, state] = await redeemFund(
          investor,
          poolProxy,
          denomination,
          redeemShare,
          acceptPending
        );
        expect(state).to.be.eq(POOL_STATE.REDEMPTION_PENDING);

        await execSwap(
          tokenABalance,
          execFeePercentage,
          tokenA.address,
          denomination.address,
          [tokenA.address, denomination.address],
          tos,
          aFurucombo,
          taskExecutor,
          poolProxy,
          manager
        );

        expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);
      });
      describe('asset', function () {
        it('add new asset in asset list', async function () {
          const amountIn = purchaseAmount.div(2);

          const beforeAssetList = await poolProxy.getAssetList();

          await execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            poolProxy,
            manager
          );

          const afterAssetList = await poolProxy.getAssetList();
          expect(afterAssetList.length - beforeAssetList.length).to.be.eq(1);
          expect(afterAssetList[afterAssetList.length - 1]).to.be.eq(
            tokenA.address
          );
        });
        it('remove 0 balance asset from asset list', async function () {
          const amountIn = purchaseAmount.div(2);

          // swap denomination to token
          await execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            poolProxy,
            manager
          );

          // swap token back to denomination
          const beforeAssetList = await poolProxy.getAssetList();
          const reversePath = [tokenA.address, denomination.address];
          const tokenAmountIn = await tokenA.balanceOf(poolVault);

          await execSwap(
            tokenAmountIn,
            execFeePercentage,
            tokenA.address,
            denomination.address,
            reversePath,
            tos,
            aFurucombo,
            taskExecutor,
            poolProxy,
            manager
          );
          const afterAssetList = await poolProxy.getAssetList();
          expect(beforeAssetList.length - afterAssetList.length).to.be.eq(1);
        });
        // TODO: replace with formula
        it('get right amount target token', async function () {
          const amountIn = purchaseAmount;
          const beforeAssetAmount = await tokenA.balanceOf(poolVault);

          await execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            poolProxy,
            manager
          );

          const afterAssetAmount = await tokenA.balanceOf(poolVault);
          expect(afterAssetAmount).to.be.gt(beforeAssetAmount);
        });
        // TODO: check again
        it.skip('get right total asset value', async function () {});
        it('should revert: exec non permit asset', async function () {
          const amountIn = purchaseAmount;
          const invalidToken = await ethers.getContractAt('IERC20', LINK_TOKEN);

          await expect(
            execSwap(
              amountIn,
              execFeePercentage,
              denomination.address,
              invalidToken.address,
              [denomination.address, invalidToken.address],
              tos,
              aFurucombo,
              taskExecutor,
              poolProxy,
              manager
            )
          ).to.be.revertedWith('revertCode(33)');
        });
      });

      it('should revert: less exec fee', async function () {
        const amountIn = purchaseAmount.div(2);
        const execFeePercentage = 0;

        await expect(
          execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            poolProxy,
            manager
          )
        ).to.be.revertedWith('FundQuotaAction: insufficient quota');
      });
    });

    //TODO: swap with different fee rate
  });
});
