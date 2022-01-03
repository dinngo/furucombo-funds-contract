import { ethers, deployments } from 'hardhat';
import { Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import {
  Comptroller,
  ImplementationMock,
  IDSProxy,
  Chainlink,
  ERC20,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  USDC_TOKEN,
  WETH_TOKEN,
  WBTC_TOKEN,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  CHAINLINK_WBTC_USD,
} from './utils/constants';

import { simpleEncode, tokenProviderQuick } from './utils/utils';

describe('Implementation', function () {
  const denominationAddress = USDC_TOKEN;
  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = WBTC_TOKEN;
  const aggregatorA = CHAINLINK_ETH_USD;
  const aggregatorB = CHAINLINK_WBTC_USD;
  const tokenAAmount = ethers.utils.parseEther('1');
  const tokenBAmount = ethers.utils.parseUnits('1', 8);
  const level = 0;

  let comptroller: Comptroller;
  let implementation: ImplementationMock;
  let vault: IDSProxy;
  let oracle: Chainlink;

  let owner: Wallet;
  let user: Wallet;

  let denomination: ERC20;
  let tokenA: ERC20;
  let tokenAProvider: Signer;
  let tokenB: ERC20;
  let tokenBProvider: Signer;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [owner, user] = await (ethers as any).getSigners();

      denomination = await ethers.getContractAt('ERC20', denominationAddress);
      tokenA = await ethers.getContractAt('ERC20', tokenAAddress);
      tokenAProvider = await tokenProviderQuick(tokenA.address);
      tokenB = await ethers.getContractAt('ERC20', tokenBAddress);
      tokenBProvider = await tokenProviderQuick(tokenB.address);

      implementation = await (
        await ethers.getContractFactory('ImplementationMock')
      ).deploy(DS_PROXY_REGISTRY);

      const canonicalResolver = await (
        await ethers.getContractFactory('RCanonical')
      ).deploy();

      const assetRegistry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await assetRegistry.register(
        denomination.address,
        canonicalResolver.address
      );
      await assetRegistry.register(tokenA.address, canonicalResolver.address);
      await assetRegistry.register(tokenB.address, canonicalResolver.address);

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.addAssets(
        [denomination.address, tokenA.address, tokenB.address],
        [denominationAggregator, aggregatorA, aggregatorB]
      );

      const assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, assetRegistry.address);

      comptroller = await (
        await ethers.getContractFactory('Comptroller')
      ).deploy(implementation.address, assetRouter.address, owner.address);

      // Initialization
      await implementation.setComptroller(comptroller.address);
      await implementation.setDenomination(denomination.address);
      await implementation.setDSProxy();
      vault = await ethers.getContractAt(
        'IDSProxy',
        await implementation.vault()
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Asset module', function () {
    describe('add asset', function () {
      it('normal', async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

        // Transfer asset to vault
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, tokenAAmount);

        // Add asset
        await implementation.addAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.be.deep.eq([
          tokenA.address,
        ]);
      });

      it('should revert: asset is not permitted', async function () {
        await expect(
          implementation.addAsset(tokenA.address)
        ).to.be.revertedWith('Invalid asset');
      });

      it('should revert: zero balance of asset', async function () {
        await comptroller.permitAssets(level, [tokenA.address]);
        await expect(
          implementation.addAsset(tokenA.address)
        ).to.be.revertedWith('No such asset');
      });
    });

    describe('remove asset', function () {
      beforeEach(async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address]);

        // Transfer asset to vault
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, tokenAAmount);

        // Add asset
        await implementation.addAsset(tokenA.address);
      });

      it('normal', async function () {
        // Drain vault by sending token back to owner
        const data = simpleEncode('transfer(address,uint256)', [
          owner.address,
          tokenAAmount,
        ]);
        await implementation.vaultCallMock(tokenA.address, data);
        await implementation.removeAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.be.deep.eq([]);
      });

      it('should revert: non-zero balance of asset', async function () {
        await expect(
          implementation.removeAsset(tokenA.address)
        ).to.be.revertedWith('Remaining asset');
      });
    });
  });

  describe('General', function () {
    it('get asset total value', async function () {
      // Get expected amount
      const expectedA = await oracle.calcConversionAmount(
        tokenA.address,
        tokenAAmount,
        denomination.address
      );
      const expectedB = await oracle.calcConversionAmount(
        tokenB.address,
        tokenBAmount,
        denomination.address
      );

      // Permit asset
      await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

      // Transfer assets to vault
      await tokenA
        .connect(tokenAProvider)
        .transfer(vault.address, tokenAAmount);
      await tokenB
        .connect(tokenBProvider)
        .transfer(vault.address, tokenBAmount);

      // Add assets to tracking list
      await implementation.addAsset(tokenA.address);
      await implementation.addAsset(tokenB.address);

      const value = await implementation.getTotalAssetValue();
      expect(value).to.be.eq(expectedA.add(expectedB));
    });

    it('zero total value', async function () {
      expect(await implementation.getTotalAssetValue()).to.be.eq(0);
    });
  });
});
