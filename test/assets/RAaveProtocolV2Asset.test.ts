import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouterMock,
  AssetOracleMock,
  RAaveProtocolV2Asset,
  IATokenV2,
} from '../../typechain';

import {
  USDC_TOKEN,
  DAI_TOKEN,
  ADAI_V2_TOKEN,
  ADAI_V2_PROVIDER,
} from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RAaveProtocolV2Asset', function () {
  const tokenAAddress = ADAI_V2_TOKEN;
  const tokenAProviderAddress = ADAI_V2_PROVIDER;
  const quoteAddress = USDC_TOKEN;

  let owner: Wallet;
  let user: Wallet;

  let tokenA: IATokenV2;
  let tokenAProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RAaveProtocolV2Asset;
  let router: AssetRouterMock;
  let oracle: AssetOracleMock;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      tokenA = await ethers.getContractAt('IATokenV2', tokenAAddress);
      tokenAProvider = await impersonateAndInjectEther(tokenAProviderAddress);

      resolver = await (
        await ethers.getContractFactory('RAaveProtocolV2Asset')
      ).deploy();
      await resolver.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();
      await registry.register(tokenA.address, resolver.address);

      oracle = await (
        await ethers.getContractFactory('AssetOracleMock')
      ).deploy();
      await oracle.deployed();

      router = await (
        await ethers.getContractFactory('AssetRouterMock')
      ).deploy(oracle.address, registry.address);
      await router.deployed();
      expect(await router.oracle()).to.be.eq(oracle.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal', async function () {
      const asset = tokenA.address;
      const amount = ether('1');
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, amount, quote);
      const underlyingTokenAddress = await tokenA.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(
        underlyingTokenAddress,
        amount,
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });

    it('max amount', async function () {
      const asset = tokenA.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // get asset value by asset resolver
      await tokenA.connect(tokenAProvider).transfer(user.address, amount);
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, constants.MaxUint256, quote);

      const underlyingTokenAddress = await tokenA.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(
        underlyingTokenAddress,
        amount,
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(tokenValue);
    });
  });
});
