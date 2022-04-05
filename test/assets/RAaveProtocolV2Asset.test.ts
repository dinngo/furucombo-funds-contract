import { constants, Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { AssetRegistry, AssetRouter, Chainlink, RAaveProtocolV2Asset, IATokenV2 } from '../../typechain';

import { USDC_TOKEN, ADAI_V2_TOKEN, ADAI_V2_PROVIDER, CHAINLINK_DAI_USD, CHAINLINK_USDC_USD } from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RAaveProtocolV2Asset', function () {
  const aTokenAddress = ADAI_V2_TOKEN;
  const aTokenProviderAddress = ADAI_V2_PROVIDER;
  const quoteAddress = USDC_TOKEN;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let aToken: IATokenV2;
  let aTokenProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RAaveProtocolV2Asset;
  let router: AssetRouter;
  let oracle: Chainlink;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    aToken = await ethers.getContractAt('IATokenV2', aTokenAddress);
    aTokenProvider = await impersonateAndInjectEther(aTokenProviderAddress);

    resolver = await (await ethers.getContractFactory('RAaveProtocolV2Asset')).deploy();
    await resolver.deployed();
    const rCanonical = await (await ethers.getContractFactory('RCanonical')).deploy();
    await rCanonical.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();
    await registry.register(aToken.address, resolver.address);
    await registry.register(await aToken.UNDERLYING_ASSET_ADDRESS(), rCanonical.address);

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();
    await oracle
      .connect(owner)
      .addAssets([await aToken.UNDERLYING_ASSET_ADDRESS(), quoteAddress], [aggregatorA, aggregatorB]);

    router = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await router.deployed();
    expect(await router.oracle()).to.be.eq(oracle.address);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal', async function () {
      const asset = aToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router.connect(user).calcAssetValue(asset, amount, quote);
      const underlyingTokenAddress = await aToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(underlyingTokenAddress, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });

    it('max amount', async function () {
      const asset = aToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // get asset value by asset resolver
      await aToken.connect(aTokenProvider).transfer(user.address, amount);
      const assetValue = await router.connect(user).calcAssetValue(asset, constants.MaxUint256, quote);

      const underlyingTokenAddress = await aToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(underlyingTokenAddress, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });
  });
});
