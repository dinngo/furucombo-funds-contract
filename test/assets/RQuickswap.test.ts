import { constants, Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  AssetOracleMock,
  IERC20,
  RQuickSwap,
  IUniswapV2Pair,
  IUniswapV2Router02,
} from '../../typechain';

import {
  USDC_TOKEN,
  QUICKSWAP_WMATIC_WETH,
  QUICKSWAP_ROUTER,
  QUICKSWAP_DAI_WETH_PROVER,
  WMATIC_TOKEN,
  WETH_TOKEN,
} from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RQuickSwap', function () {
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = WMATIC_TOKEN;
  const quoteAddress = USDC_TOKEN;
  const lpTokenAddress = QUICKSWAP_WMATIC_WETH;
  const lpTokenProviderAddress = QUICKSWAP_DAI_WETH_PROVER;

  let owner: Wallet;
  let user: Wallet;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let lpToken: IERC20;
  let lpTokenProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RQuickSwap;
  let router: AssetRouter;
  let oracle: AssetOracleMock;

  let pair: IUniswapV2Pair;
  let quickRouter: IUniswapV2Router02;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      lpTokenProvider = await impersonateAndInjectEther(lpTokenProviderAddress);
      tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
      tokenB = await ethers.getContractAt('IERC20', tokenBAddress);
      lpToken = await ethers.getContractAt('IERC20', lpTokenAddress);

      resolver = await (await ethers.getContractFactory('RQuickSwap')).deploy();
      await resolver.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();
      await registry.register(lpToken.address, resolver.address);

      oracle = await (
        await ethers.getContractFactory('AssetOracleMock')
      ).deploy();
      await oracle.deployed();

      router = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await router.deployed();
      expect(await router.oracle()).to.be.eq(oracle.address);

      pair = await ethers.getContractAt('IUniswapV2Pair', lpTokenAddress);
      quickRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        QUICKSWAP_ROUTER
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal', async function () {
      const assets = [lpToken.address];
      const amounts = [ether('1.12')];
      const quote = quoteAddress;

      // calculate expected value
      await lpToken.connect(lpTokenProvider).transfer(user.address, amounts[0]);
      await lpToken.connect(user).approve(quickRouter.address, amounts[0]);
      const tokenOuts = await quickRouter
        .connect(user)
        .callStatic.removeLiquidity(
          tokenA.address,
          tokenB.address,
          amounts[0],
          1,
          1,
          user.address,
          (await ethers.provider.getBlock('latest')).timestamp + 100
        );

      const token0Value = await oracle.calcConversionAmount(
        await pair.token0(),
        tokenOuts[0],
        quote
      );

      const token1Value = await oracle.calcConversionAmount(
        await pair.token1(),
        tokenOuts[1],
        quote
      );

      // Execution
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetsTotalValue(assets, amounts, quote);

      // Verify
      expect(assetValue).to.be.eq(token0Value.add(token1Value));
    });

    it('max amount', async function () {
      const assets = [lpToken.address];
      const amount = ether('1.12');
      const amounts = [constants.MaxUint256];
      const quote = quoteAddress;

      await lpToken.connect(lpTokenProvider).transfer(user.address, amount);
      await lpToken.connect(user).approve(quickRouter.address, amount);
      const tokenOuts = await quickRouter
        .connect(user)
        .callStatic.removeLiquidity(
          tokenA.address,
          tokenB.address,
          amount,
          1,
          1,
          user.address,
          (await ethers.provider.getBlock('latest')).timestamp + 100
        );

      const token0Value = await oracle.calcConversionAmount(
        await pair.token0(),
        tokenOuts[0],
        quote
      );
      const token1Value = await oracle.calcConversionAmount(
        await pair.token1(),
        tokenOuts[1],
        quote
      );

      // Execution
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetsTotalValue(assets, amounts, quote);

      // Verify
      expect(assetValue).to.be.eq(token0Value.add(token1Value));
    });
  });
});
