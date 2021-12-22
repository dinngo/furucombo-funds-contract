import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  IERC20,
  RSushiSwap,
  IUniswapV2Pair,
  IUniswapV2Router02,
} from '../../typechain';

import {
  USDC_TOKEN,
  DAI_TOKEN,
  SUSHISWAP_WETH_DAI,
  SUSHISWAP_ROUTER,
  WETH_TOKEN,
  CHAINLINK_ETH_USD,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
} from '../utils/constants';

import { ether, tokenProviderQuick } from '../utils/utils';

describe('RSushiSwap', function () {
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = DAI_TOKEN;
  const quoteAddress = USDC_TOKEN;
  const lpTokenAddress = SUSHISWAP_WETH_DAI;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_ETH_USD;
  const aggregatorC = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let lpToken: IERC20;
  let tokenAProvider: Signer;
  let tokenBProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RSushiSwap;
  let router: AssetRouter;
  let oracle: Chainlink;

  let pair: IUniswapV2Pair;
  let sushiRouter: IUniswapV2Router02;
  let lpAmount: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      tokenAProvider = await tokenProviderQuick(tokenAAddress);
      tokenBProvider = await tokenProviderQuick(tokenBAddress);
      tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
      tokenB = await ethers.getContractAt('IERC20', tokenBAddress);
      lpToken = await ethers.getContractAt('IERC20', lpTokenAddress);

      resolver = await (await ethers.getContractFactory('RSushiSwap')).deploy();
      await resolver.deployed();

      const rCanonical = await (
        await ethers.getContractFactory('RCanonical')
      ).deploy();
      await rCanonical.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();
      await registry.register(lpToken.address, resolver.address);
      await registry.register(tokenA.address, rCanonical.address);
      await registry.register(tokenB.address, rCanonical.address);

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();
      await oracle
        .connect(owner)
        .addAssets(
          [tokenA.address, tokenB.address, quoteAddress],
          [aggregatorA, aggregatorB, aggregatorC]
        );

      router = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await router.deployed();
      expect(await router.oracle()).to.be.eq(oracle.address);

      pair = await ethers.getContractAt('IUniswapV2Pair', lpTokenAddress);
      sushiRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        SUSHISWAP_ROUTER
      );

      // Deposit to get lp token
      const amount = ether('50');
      await tokenA.connect(tokenAProvider).transfer(user.address, amount);
      await tokenA.connect(user).approve(sushiRouter.address, amount);
      await tokenB.connect(tokenBProvider).transfer(user.address, amount);
      await tokenB.connect(user).approve(sushiRouter.address, amount);

      await sushiRouter
        .connect(user)
        .addLiquidity(
          tokenA.address,
          tokenB.address,
          ether('1'),
          ether('1'),
          1,
          1,
          user.address,
          (await ethers.provider.getBlock('latest')).timestamp + 100
        );
      lpAmount = await pair.balanceOf(user.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal', async function () {
      const assets = [lpToken.address];
      const amounts = [lpAmount];
      const quote = quoteAddress;

      // calculate expected value
      await lpToken.connect(user).approve(sushiRouter.address, amounts[0]);

      // get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetsTotalValue(assets, amounts, quote);

      // execute remove liquidity to get return amount to calculate
      const tokenAUserBefore = await tokenA.balanceOf(user.address);
      const tokenBUserBefore = await tokenB.balanceOf(user.address);
      await sushiRouter
        .connect(user)
        .removeLiquidity(
          tokenA.address,
          tokenB.address,
          amounts[0],
          1,
          1,
          user.address,
          (await ethers.provider.getBlock('latest')).timestamp + 100
        );

      const token0Value = await oracle.calcConversionAmount(
        tokenA.address,
        (await tokenA.balanceOf(user.address)).sub(tokenAUserBefore),
        quote
      );

      const token1Value = await oracle.calcConversionAmount(
        tokenB.address,
        (await tokenB.balanceOf(user.address)).sub(tokenBUserBefore),
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(token0Value.add(token1Value));
    });

    it('max amount', async function () {
      const assets = [lpToken.address];
      const amount = lpAmount;
      const amounts = [constants.MaxUint256];
      const quote = quoteAddress;

      // Execution
      await lpToken.connect(user).approve(sushiRouter.address, amount);
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetsTotalValue(assets, amounts, quote);

      // execute remove liquidity to get return amount to calculate
      const tokenAUserBefore = await tokenA.balanceOf(user.address);
      const tokenBUserBefore = await tokenB.balanceOf(user.address);
      await sushiRouter
        .connect(user)
        .removeLiquidity(
          tokenA.address,
          tokenB.address,
          amount,
          1,
          1,
          user.address,
          (await ethers.provider.getBlock('latest')).timestamp + 100
        );

      const token0Value = await oracle.calcConversionAmount(
        tokenA.address,
        (await tokenA.balanceOf(user.address)).sub(tokenAUserBefore),
        quote
      );

      const token1Value = await oracle.calcConversionAmount(
        tokenB.address,
        (await tokenB.balanceOf(user.address)).sub(tokenBUserBefore),
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(token0Value.add(token1Value));
    });
  });
});
