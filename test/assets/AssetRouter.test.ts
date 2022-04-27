import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetResolverMockA,
  AssetResolverMockB,
  AssetRouter,
  AssetOracleMock,
  IERC20,
} from '../../typechain';

import { DAI_TOKEN, LINK_TOKEN, CRV_TOKEN, USDC_TOKEN } from '../utils/constants';

import { ether, tokenProviderQuick } from '../utils/utils';

describe('AssetRouter', function () {
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = LINK_TOKEN;
  const tokenCAddress = CRV_TOKEN;
  const quoteAddress = USDC_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let tokenC: IERC20;
  let tokenAProvider: Signer;

  let registry: AssetRegistry;
  let resolverA: AssetResolverMockA;
  let resolverB: AssetResolverMockB;
  let router: AssetRouter;
  let oracle: AssetOracleMock;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    tokenAProvider = await tokenProviderQuick(tokenAAddress);
    tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
    tokenB = await ethers.getContractAt('IERC20', tokenBAddress);
    tokenC = await ethers.getContractAt('IERC20', tokenCAddress);

    resolverA = await (await ethers.getContractFactory('AssetResolverMockA')).deploy();
    await resolverA.deployed();

    resolverB = await (await ethers.getContractFactory('AssetResolverMockB')).deploy();
    await resolverB.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();
    await registry.register(tokenA.address, resolverA.address);
    await registry.register(tokenB.address, resolverA.address);
    await registry.register(tokenC.address, resolverB.address);

    oracle = await (await ethers.getContractFactory('AssetOracleMock')).deploy();
    await oracle.deployed();

    router = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await router.deployed();

    expect(await router.oracle()).to.be.eq(oracle.address);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('oracle', function () {
    it('set oracle', async function () {
      await router.connect(owner).setOracle(someone.address);
      expect(await router.oracle()).to.be.eq(someone.address);
    });

    it('should revert: set oracle by non-owner', async function () {
      await expect(router.connect(user).setOracle(someone.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('registry', function () {
    it('set registry', async function () {
      await router.connect(owner).setRegistry(someone.address);
      expect(await router.registry()).to.be.eq(someone.address);
    });

    it('should revert: set registry by non-owner', async function () {
      await expect(router.connect(user).setRegistry(someone.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('calculate asset value ', function () {
    it('calculate single asset', async function () {
      const assets = [tokenA.address];
      const amounts = [ether('1')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      expect(assetValue).to.be.eq(amounts[0].mul(2));
    });

    it('calculate single asset without using resolver', async function () {
      const assets = [quoteAddress];
      const amounts = [ether('1')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      expect(assetValue).to.be.eq(amounts[0]);
    });

    it('calculate multiple assets', async function () {
      const assets = [tokenA.address, tokenB.address];
      const amounts = [ether('1'), ether('0.5')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      const expectValue = amounts[0].add(amounts[1]).mul(BigNumber.from('2'));
      expect(assetValue).to.be.eq(expectValue);
    });

    it('calculate multiple assets with debt', async function () {
      const assets = [tokenA.address, tokenC.address];
      const amounts = [ether('1'), ether('0.5')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      const expectValue = amounts[0].mul(BigNumber.from('2')).sub(amounts[1].mul(BigNumber.from('2')));
      expect(assetValue).to.be.eq(expectValue);
    });

    it('zero value', async function () {
      const assets = [tokenA.address, tokenC.address];
      const amounts = [ether('1'), ether('1')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);
      expect(assetValue).to.be.eq(0);
    });

    it('zero value with empty assets', async function () {
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue([], [], quote);
      expect(assetValue).to.be.eq(0);
    });

    it('int256 max amount', async function () {
      const assets = [tokenA.address];
      const amounts = [constants.MaxInt256.div(2)];

      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      expect(assetValue).to.be.eq(await oracle.calcConversionAmount(assets[0], amounts[0], quote));
    });

    it('should revert: negative value', async function () {
      const assets = [tokenC.address];
      const amounts = [ether('1')];
      const quote = quoteAddress;

      await expect(router.connect(user).calcAssetsTotalValue(assets, amounts, quote)).to.be.revertedWith(
        'RevertCode(50)'
      ); // ASSET_ROUTER_NEGATIVE_VALUE
    });

    it('should revert: assets length and amounts length are different', async function () {
      const assets = [tokenA.address, tokenB.address];
      const amounts = [ether('1')];
      const quote = quoteAddress;

      await expect(router.connect(user).calcAssetsTotalValue(assets, amounts, quote)).to.be.revertedWith(
        'RevertCode(49)'
      ); // ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });

    it('should revert: asset resolver is not registered', async function () {
      const assets = [quoteAddress];
      const amounts = [ether('1')];
      const quote = tokenA.address;

      await expect(router.connect(user).calcAssetsTotalValue(assets, amounts, quote)).to.be.revertedWith(
        'RevertCode(57)'
      ); // ASSET_REGISTRY_UNREGISTERED
    });

    it('should revert: asset negative value overflow', async function () {
      const assets = [tokenA.address];
      const amounts = [constants.MaxUint256.div(2)];
      const quote = quoteAddress;

      await expect(router.connect(user).calcAssetsTotalValue(assets, amounts, quote)).to.be.revertedWith(
        "SafeCast: value doesn't fit in an int256"
      );
    });
  });
});
