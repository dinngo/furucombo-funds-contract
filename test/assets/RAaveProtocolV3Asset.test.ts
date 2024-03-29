import { Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  RAaveProtocolV3Asset,
  RAaveProtocolV3AssetMock,
  IATokenV3,
} from '../../typechain';

import { USDC_TOKEN, ADAI_V3_TOKEN, ADAI_V3_PROVIDER, CHAINLINK_DAI_USD, CHAINLINK_USDC_USD } from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RAaveProtocolV3Asset', function () {
  const aTokenAddress = ADAI_V3_TOKEN;
  const aTokenProviderAddress = ADAI_V3_PROVIDER;
  const quoteAddress = USDC_TOKEN;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let aToken: IATokenV3;
  let aTokenProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RAaveProtocolV3Asset;
  let resolverMock: RAaveProtocolV3AssetMock;
  let router: AssetRouter;
  let oracle: Chainlink;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    aToken = await ethers.getContractAt('IATokenV3', aTokenAddress);
    aTokenProvider = await impersonateAndInjectEther(aTokenProviderAddress);

    resolver = await (await ethers.getContractFactory('RAaveProtocolV3Asset')).deploy();
    await resolver.deployed();
    resolverMock = await (await ethers.getContractFactory('RAaveProtocolV3AssetMock')).deploy();
    await resolverMock.deployed();
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

      // Verify
      expect(assetValue).to.be.eq(tokenValue);
    });

    it('should revert: resolver asset value negative', async function () {
      const asset = aToken.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // Change to mock resolver
      await registry.unregister(asset);
      await registry.register(asset, resolverMock.address);

      await expect(router.connect(user).calcAssetValue(asset, amount, quote)).to.be.revertedWith('RevertCode(55)'); // RESOLVER_ASSET_VALUE_NEGATIVE
    });
  });
});
