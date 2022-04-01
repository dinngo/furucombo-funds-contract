import { constants, Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { AssetRegistry, AssetRouter, Chainlink, IERC20, RCanonical } from '../../typechain';

import { DAI_TOKEN, USDC_TOKEN, CHAINLINK_DAI_USD, CHAINLINK_USDC_USD } from '../utils/constants';

import { ether, tokenProviderQuick } from '../utils/utils';

describe('RCanonical', function () {
  const tokenAAddress = DAI_TOKEN;
  const quoteAddress = USDC_TOKEN;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let tokenA: IERC20;
  let tokenAProvider: Signer;

  let registry: AssetRegistry;
  let resolver: RCanonical;
  let router: AssetRouter;
  let oracle: Chainlink;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    tokenAProvider = await tokenProviderQuick(tokenAAddress);
    tokenA = await ethers.getContractAt('IERC20', tokenAAddress);

    resolver = await (await ethers.getContractFactory('RCanonical')).deploy();
    await resolver.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();
    await registry.register(tokenA.address, resolver.address);

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();
    await oracle.connect(owner).addAssets([tokenA.address, quoteAddress], [aggregatorA, aggregatorB]);

    router = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await router.deployed();

    expect(await router.oracle()).to.be.eq(oracle.address);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('calculate asset value ', function () {
    it('normal', async function () {
      const assets = [tokenA.address];
      const amounts = [ether('1')];
      const quote = quoteAddress;
      const assetValue = await router.calcAssetsTotalValue(assets, amounts, quote);

      expect(assetValue).to.be.eq(await oracle.calcConversionAmount(assets[0], amounts[0], quote));
    });

    it('max amount', async function () {
      const amount = ether('1');
      const assets = [tokenA.address];
      const amounts = [constants.MaxUint256];
      const quote = quoteAddress;

      await tokenA.connect(tokenAProvider).transfer(user.address, amount);
      const assetValue = await router.connect(user).calcAssetsTotalValue(assets, amounts, quote);

      expect(assetValue).to.be.eq(await oracle.calcConversionAmount(assets[0], amount, quote));
    });
  });
});
