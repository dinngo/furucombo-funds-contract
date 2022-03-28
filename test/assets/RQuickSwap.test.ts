import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { AssetRegistry, AssetRouter, Chainlink, IERC20, RUniSwapV2Like, IUniswapV2Pair } from '../../typechain';

import {
  USDC_TOKEN,
  DAI_TOKEN,
  WETH_TOKEN,
  USDT_TOKEN,
  WMATIC_TOKEN,
  QUICKSWAP_USDC_WETH,
  QUICKSWAP_USDC_USDT,
  QUICKSWAP_WMATIC_WETH,
  CHAINLINK_ETH_USD,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_USDT_USD,
  CHAINLINK_MATIC_USD,
} from '../utils/constants';

import { ether, calcSqrt, expectEqWithinBps } from '../utils/utils';

describe('RQuickSwap', function () {
  const tokenAAddress = USDT_TOKEN;
  const tokenBAddress = WETH_TOKEN;
  const tokenCAddress = WMATIC_TOKEN;
  const quoteEq18Address = DAI_TOKEN;
  const quoteLt18Address = USDC_TOKEN;

  const lpTokenBoth18Address = QUICKSWAP_WMATIC_WETH;
  const lpTokenBoth8Address = QUICKSWAP_USDC_USDT;
  const lpTokenHalf8Address = QUICKSWAP_USDC_WETH;

  const tokenAAggregator = CHAINLINK_USDT_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;
  const tokenCAggregator = CHAINLINK_MATIC_USD;
  const quoteEq18Aggregator = CHAINLINK_DAI_USD;
  const quoteLt18Aggregator = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let registry: AssetRegistry;
  let resolver: RUniSwapV2Like;
  let router: AssetRouter;
  let oracle: Chainlink;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    resolver = await (await ethers.getContractFactory('RUniSwapV2Like')).deploy();
    await resolver.deployed();

    const rCanonical = await (await ethers.getContractFactory('RCanonical')).deploy();
    await rCanonical.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();
    await registry.register(lpTokenBoth18Address, resolver.address);
    await registry.register(lpTokenBoth8Address, resolver.address);
    await registry.register(lpTokenHalf8Address, resolver.address);
    await registry.register(tokenAAddress, rCanonical.address);
    await registry.register(tokenBAddress, rCanonical.address);
    await registry.register(tokenCAddress, rCanonical.address);
    await registry.register(quoteEq18Address, rCanonical.address);
    await registry.register(quoteLt18Address, rCanonical.address);

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();
    await oracle
      .connect(owner)
      .addAssets(
        [tokenAAddress, tokenBAddress, tokenCAddress, quoteEq18Address, quoteLt18Address],
        [tokenAAggregator, tokenBAggregator, tokenCAggregator, quoteEq18Aggregator, quoteLt18Aggregator]
      );

    router = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await router.deployed();
    expect(await router.oracle()).to.be.eq(oracle.address);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal: two tokens(=18 decimal) with quote(= 18 decimal)', async function () {
      const asset = lpTokenBoth18Address;
      const amount = ether('1.12');
      const quote = quoteEq18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      // Verify
      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });

    it('normal: two tokens(=18 decimal) with quote(< 18 decimal)', async function () {
      const asset = lpTokenBoth18Address;
      const amount = ether('1.12');
      const quote = quoteLt18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });

    it('normal: one (<18 decimal) of tokens with quote(= 18 decimal)', async function () {
      const asset = lpTokenHalf8Address;
      const amount = ether('1.12');
      const quote = quoteEq18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      // Verify
      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });

    it('normal: one (<18 decimal) of tokens with quote(< 18 decimal)', async function () {
      const asset = lpTokenHalf8Address;
      const amount = ether('1.12');
      const quote = quoteLt18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      // Verify
      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });

    it('normal: two tokens(<18 decimal) with quote(= 18 decimal)', async function () {
      const asset = lpTokenBoth8Address;
      const amount = ether('1.12');
      const quote = quoteEq18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      // Verify
      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });

    it('normal: two tokens(<18 decimal) with quote(< 18 decimal)', async function () {
      const asset = lpTokenBoth8Address;
      const amount = ether('1.12');
      const quote = quoteLt18Address;

      // Calculate expect value
      const pair = await ethers.getContractAt('IUniswapV2Pair', asset);
      const weightedGeometricMeanValue = await _getWeightedGeometricMean(pair, amount, quote);
      const arithmeticMeanValue = await _getArithmeticMean(pair, amount, quote);

      // Get asset value by asset resolver
      const assetValue = await router.connect(user).callStatic.calcAssetValue(asset, amount, quote);

      // Verify
      expect(assetValue).to.be.eq(weightedGeometricMeanValue);
      expectEqWithinBps(assetValue, arithmeticMeanValue, 1);
    });
  });

  async function _getArithmeticMean(pair: IUniswapV2Pair, amount: BigNumber, quote: string) {
    const Bone = ether('1');
    const totalSupply = await _getTotalSupplyAtWithdrawal(pair);
    const [reserve0, reserve1] = await pair.getReserves();
    const reserve0Value = await oracle.calcConversionAmount(await pair.token0(), reserve0, quote);

    const reserve1Value = await oracle.calcConversionAmount(await pair.token1(), reserve1, quote);

    const expectValue = reserve0Value.add(reserve1Value).mul(amount).mul(Bone).div(totalSupply).div(Bone);
    return expectValue;
  }

  async function _getWeightedGeometricMean(pair: IUniswapV2Pair, amount: BigNumber, quote: string) {
    const Bone = ether('1');
    const [reserve0, reserve1] = await pair.getReserves();
    const reserve0Value = await oracle.calcConversionAmount(await pair.token0(), reserve0, quote);
    const reserve1Value = await oracle.calcConversionAmount(await pair.token1(), reserve1, quote);
    const square = calcSqrt(reserve0Value.mul(reserve1Value));
    const totalSupply = await _getTotalSupplyAtWithdrawal(pair);
    const totalValueQuote = BigNumber.from('2').mul(square).mul(amount).mul(Bone);
    const expectValue = totalValueQuote.div(totalSupply).div(Bone);
    return expectValue;
  }

  async function _getTotalSupplyAtWithdrawal(pair: IUniswapV2Pair) {
    let totalSupply = await pair.totalSupply();
    const factory = await ethers.getContractAt('IUniswapV2Factory', await pair.factory());
    const feeTo = await factory.feeTo();

    if (feeTo !== constants.AddressZero) {
      const kLast = await pair.kLast();
      if (kLast.gt(0)) {
        const [reserve0, reserve1] = await pair.getReserves();
        const rootK = calcSqrt(reserve0.mul(reserve1));
        const rootKLast = calcSqrt(kLast);
        if (rootK.gt(rootKLast)) {
          const numerator = totalSupply.mul(rootK.sub(rootKLast));
          const denominator = rootK.mul(BigNumber.from(5)).add(rootKLast);
          const liquidity = numerator.div(denominator);
          totalSupply = totalSupply.add(liquidity);
        }
      }
    }
    return totalSupply;
  }
});
