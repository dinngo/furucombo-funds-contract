import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  ERC20,
  RCurveStable,
  ICurveLiquidityPool,
  RCanonical,
} from '../../typechain';

import {
  USDC_TOKEN,
  DAI_TOKEN,
  USDT_TOKEN,
  CURVE_AAVECRV,
  CURVE_AAVECRV_PROVIDER,
  CURVE_AAVE_SWAP,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_USDT_USD,
} from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RCurveStable', function () {
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = USDT_TOKEN;
  const quoteAddress = USDC_TOKEN;
  const lpTokenAddress = CURVE_AAVECRV;
  const lpTokenProviderAddress = CURVE_AAVECRV_PROVIDER;
  const lpTokenSwapAddress = CURVE_AAVE_SWAP;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDT_USD;
  const aggregatorC = CHAINLINK_USDC_USD;
  const virutalPriceUnit = ether('1');

  let owner: Wallet;
  let user: Wallet;

  let token: ERC20;
  let lpToken: ERC20;
  let lpTokenProvider: Signer;

  // asset router
  let registry: AssetRegistry;
  let resolver: RCurveStable;
  let canonicalResolver: RCanonical;
  let router: AssetRouter;
  let oracle: Chainlink;

  // external service
  let liquidityPool: ICurveLiquidityPool;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      lpTokenProvider = await impersonateAndInjectEther(lpTokenProviderAddress);
      lpToken = await ethers.getContractAt('ERC20', lpTokenAddress);

      resolver = await (
        await ethers.getContractFactory('RCurveStable')
      ).deploy();
      await resolver.deployed();

      canonicalResolver = await (
        await ethers.getContractFactory('RCanonical')
      ).deploy();
      await canonicalResolver.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();
      await registry.register(lpToken.address, resolver.address);

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();
      await oracle
        .connect(owner)
        .addAssets(
          [tokenAAddress, tokenBAddress, quoteAddress],
          [aggregatorA, aggregatorB, aggregatorC]
        );

      router = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await router.deployed();
      expect(await router.oracle()).to.be.eq(oracle.address);

      liquidityPool = await ethers.getContractAt(
        'ICurveLiquidityPool',
        lpTokenSwapAddress
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('set pool info', function () {
    beforeEach(async function () {
      token = await ethers.getContractAt('ERC20', tokenAAddress);
    });

    it('set', async function () {
      const poolInfoBefore = await resolver.assetToPoolInfo(lpToken.address);
      expect(poolInfoBefore.pool).to.be.eq(constants.AddressZero);
      expect(poolInfoBefore.valuedAsset).to.be.eq(constants.AddressZero);
      expect(poolInfoBefore.valuedAssetDecimals).to.be.eq(0);

      // Execution
      const decimals = await token.decimals();
      await expect(
        resolver
          .connect(owner)
          .setPoolInfo(
            lpToken.address,
            liquidityPool.address,
            token.address,
            decimals
          )
      )
        .to.emit(resolver, 'PoolInfoSet')
        .withArgs(
          lpToken.address,
          liquidityPool.address,
          token.address,
          decimals
        );

      // Verify
      const poolInfoAfter = await resolver.assetToPoolInfo(lpToken.address);
      expect(poolInfoAfter.pool).to.be.eq(liquidityPool.address);
      expect(poolInfoAfter.valuedAsset).to.be.eq(token.address);
      expect(poolInfoAfter.valuedAssetDecimals).to.be.eq(decimals);
    });

    it('should revert: zero asset address', async function () {
      await expect(
        resolver
          .connect(owner)
          .setPoolInfo(
            constants.AddressZero,
            liquidityPool.address,
            token.address,
            await token.decimals()
          )
      ).to.be.revertedWith('revertCode(59)'); // RCURVE_STABLE_ZERO_ASSET_ADDRESS
    });

    it('should revert: zero valued asset address', async function () {
      await expect(
        resolver
          .connect(owner)
          .setPoolInfo(
            lpToken.address,
            liquidityPool.address,
            constants.AddressZero,
            await token.decimals()
          )
      ).to.be.revertedWith('revertCode(61)'); // RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS
    });

    it('should revert: zero asset decimal', async function () {
      await expect(
        resolver
          .connect(owner)
          .setPoolInfo(lpToken.address, liquidityPool.address, token.address, 0)
      ).to.be.revertedWith('revertCode(62)'); // RCURVE_STABLE_ZERO_VALUED_ASSET_DECIMAL
    });

    it('should revert: zero pool address', async function () {
      await expect(
        resolver
          .connect(owner)
          .setPoolInfo(
            lpToken.address,
            constants.AddressZero,
            token.address,
            await token.decimals()
          )
      ).to.be.revertedWith('revertCode(60)'); // RCURVE_STABLE_ZERO_POOL_ADDRESS
    });

    it('should revert: non-owner', async function () {
      await expect(
        resolver
          .connect(user)
          .setPoolInfo(
            lpToken.address,
            liquidityPool.address,
            token.address,
            await token.decimals()
          )
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('remove pool info', function () {
    beforeEach(async function () {
      token = await ethers.getContractAt('ERC20', tokenAAddress);
      await resolver
        .connect(owner)
        .setPoolInfo(
          lpToken.address,
          liquidityPool.address,
          token.address,
          await token.decimals()
        );
    });

    it('remove', async function () {
      const poolInfoBefore = await resolver.assetToPoolInfo(lpToken.address);
      expect(poolInfoBefore.pool).to.be.eq(liquidityPool.address);
      expect(poolInfoBefore.valuedAsset).to.be.eq(token.address);
      expect(poolInfoBefore.valuedAssetDecimals).to.be.eq(
        await token.decimals()
      );

      // Execution
      await expect(resolver.connect(owner).removePoolInfo(lpToken.address))
        .to.emit(resolver, 'PoolInfoRemoved')
        .withArgs(lpToken.address);

      // Verify
      const poolInfoAfter = await resolver.assetToPoolInfo(lpToken.address);
      expect(poolInfoAfter.pool).to.be.eq(constants.AddressZero);
      expect(poolInfoAfter.valuedAsset).to.be.eq(constants.AddressZero);
      expect(poolInfoAfter.valuedAssetDecimals).to.be.eq(0);
    });

    it('should revert: not set yet', async function () {
      await expect(
        resolver.connect(owner).removePoolInfo(token.address)
      ).to.be.revertedWith('revertCode(63)'); // RCURVE_STABLE_POOL_INFO_IS_NOT_SET
    });

    it('should revert: non-owner', async function () {
      await expect(
        resolver.connect(user).removePoolInfo(token.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('calculate value with 18 decimal valued asset', function () {
    beforeEach(async function () {
      token = await ethers.getContractAt('ERC20', tokenAAddress);
      await registry.register(token.address, canonicalResolver.address);
      await resolver
        .connect(owner)
        .setPoolInfo(
          lpToken.address,
          liquidityPool.address,
          token.address,
          await token.decimals()
        );
    });

    it('normal', async function () {
      const asset = lpToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      const virtualPrice = await liquidityPool.get_virtual_price();
      const tokenValue = await oracle.calcConversionAmount(
        token.address,
        virtualPrice.mul(amount).div(virutalPriceUnit),
        quote
      );

      // Get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });

    it('max amount', async function () {
      const asset = lpToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // calculate expect value
      await lpToken.connect(lpTokenProvider).transfer(user.address, amount);
      const virtualPrice = await liquidityPool.get_virtual_price();
      const tokenValue = await oracle.calcConversionAmount(
        token.address,
        virtualPrice.mul(amount).div(virutalPriceUnit),
        quote
      );

      // Get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, constants.MaxUint256, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });
  });

  describe('calculate value < 18 decimal valued asset', function () {
    beforeEach(async function () {
      token = await ethers.getContractAt('ERC20', tokenBAddress);
      await registry.register(token.address, canonicalResolver.address);
      await resolver
        .connect(owner)
        .setPoolInfo(
          lpToken.address,
          liquidityPool.address,
          token.address,
          await token.decimals()
        );
      expect(await token.decimals()).to.be.lt(18);
    });

    it('normal', async function () {
      const asset = lpToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // Calculate expect value
      const virtualPrice = await liquidityPool.get_virtual_price();
      const tokenValue = await oracle.calcConversionAmount(
        token.address,
        virtualPrice
          .mul(amount)
          .mul(BigNumber.from(10 ** (await token.decimals())))
          .div(virutalPriceUnit)
          .div(virutalPriceUnit),
        quote
      );

      // Get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });

    it('max amount', async function () {
      const asset = lpToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // Calculate expect value
      await lpToken.connect(lpTokenProvider).transfer(user.address, amount);
      const virtualPrice = await liquidityPool.get_virtual_price();
      const tokenValue = await oracle.calcConversionAmount(
        token.address,
        virtualPrice
          .mul(amount)
          .mul(BigNumber.from(10 ** (await token.decimals())))
          .div(virutalPriceUnit)
          .div(virutalPriceUnit),
        quote
      );

      // Get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, constants.MaxUint256, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });
  });
});
