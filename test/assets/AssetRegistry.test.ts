import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { AssetRegistry, AssetResolverMockA } from '../../typechain';

import { DAI_TOKEN, LINK_TOKEN } from '../utils/constants';

describe('AssetRegistry', function () {
  const token0Address = DAI_TOKEN;
  const token1Address = LINK_TOKEN;

  let owner: Wallet;
  let user: Wallet;

  let registry: AssetRegistry;
  let resolver: AssetResolverMockA;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();

      resolver = await (
        await ethers.getContractFactory('AssetResolverMockA')
      ).deploy();
      await resolver.deployed();
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('register', function () {
    it('normal', async function () {
      const assetAddress = token0Address;

      await expect(
        registry.connect(user).resolvers(assetAddress)
      ).to.be.revertedWith('AssetRegistry: unregistered');

      await expect(
        registry.connect(owner).register(assetAddress, resolver.address)
      )
        .to.emit(registry, 'Registered')
        .withArgs(assetAddress, resolver.address);

      expect(await registry.resolvers(assetAddress)).to.be.eq(resolver.address);
    });

    it('should revert: resolver has been banned', async function () {
      const assetAddress = token0Address;
      await registry.connect(owner).banResolver(resolver.address);

      await expect(
        registry.connect(owner).register(assetAddress, resolver.address)
      ).to.be.revertedWith('AssetRegistry: resolver has been banned');
    });
    it('should revert: resolver has been registered', async function () {
      const assetAddress = token0Address;
      await registry.connect(owner).register(assetAddress, resolver.address);

      await expect(
        registry.connect(owner).register(assetAddress, resolver.address)
      ).to.be.revertedWith('AssetRegistry: resolver is registered');
    });

    it('should revert: asset zero address', async function () {
      await expect(
        registry
          .connect(owner)
          .register(constants.AddressZero, resolver.address)
      ).to.be.revertedWith('AssetRegistry: asset zero address');
    });

    it('should revert: resolver zero address', async function () {
      const assetAddress = token0Address;
      await expect(
        registry.connect(owner).register(assetAddress, constants.AddressZero)
      ).to.be.revertedWith('AssetRegistry: resolver zero address');
    });

    it('should revert: non-owner', async function () {
      const assetAddress = token0Address;
      await expect(
        registry.connect(user).register(assetAddress, resolver.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('unregister', function () {
    const assetAddress = token0Address;
    beforeEach(async function () {
      await expect(
        registry.connect(owner).register(assetAddress, resolver.address)
      )
        .to.emit(registry, 'Registered')
        .withArgs(assetAddress, resolver.address);
      expect(await registry.resolvers(assetAddress)).to.be.eq(resolver.address);
    });

    it('normal', async function () {
      const assetAddress = token0Address;

      await expect(registry.connect(owner).unregister(assetAddress))
        .to.emit(registry, 'Unregistered')
        .withArgs(assetAddress);

      await expect(
        registry.connect(user).resolvers(assetAddress)
      ).to.be.revertedWith('AssetRegistry: unregistered');
    });

    it('should revert: resolver is not registered', async function () {
      await expect(
        registry.connect(owner).unregister(token1Address)
      ).to.be.revertedWith('AssetRegistry: asset not registered');
    });

    it('should revert: asset zero address', async function () {
      await expect(
        registry.connect(owner).unregister(constants.AddressZero)
      ).to.be.revertedWith('AssetRegistry: asset zero address');
    });

    it('should revert: non-owner', async function () {
      await expect(
        registry.connect(user).unregister(constants.AddressZero)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('ban resolver', function () {
    const assetAAddress = token0Address;
    beforeEach(async function () {
      await registry.connect(owner).register(assetAAddress, resolver.address);
      expect(await registry.resolvers(assetAAddress)).to.be.eq(
        resolver.address
      );

      expect(await registry.bannedResolvers(resolver.address)).to.be.eq(false);
    });

    it('ban resolver with single asset', async function () {
      const assetAddress = token0Address;

      await expect(registry.connect(owner).banResolver(resolver.address))
        .to.emit(registry, 'BannedResolver')
        .withArgs(resolver.address);

      await expect(
        registry.connect(user).resolvers(assetAddress)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');

      expect(await registry.bannedResolvers(resolver.address)).to.be.eq(true);
    });

    it('ban resolver with multiple assets', async function () {
      const assetBAddress = token1Address;
      await registry.connect(owner).register(assetBAddress, resolver.address);

      await expect(registry.connect(owner).banResolver(resolver.address))
        .to.emit(registry, 'BannedResolver')
        .withArgs(resolver.address);

      await expect(
        registry.connect(user).resolvers(assetAAddress)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');

      await expect(
        registry.connect(user).resolvers(assetBAddress)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');

      expect(await registry.bannedResolvers(resolver.address)).to.be.eq(true);
    });

    it('should revert: resolver has been banned', async function () {
      await registry.connect(owner).banResolver(resolver.address);
      await expect(
        registry.connect(owner).banResolver(resolver.address)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');
    });

    it('should revert: asset zero address', async function () {
      await expect(
        registry.connect(owner).banResolver(constants.AddressZero)
      ).to.be.revertedWith('AssetRegistry: resolver zero address');
    });

    it('should revert: non-owner', async function () {
      await expect(
        registry.connect(user).banResolver(resolver.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('unban resolver', function () {
    const assetAAddress = token0Address;
    const assetBAddress = token1Address;
    beforeEach(async function () {
      await registry.connect(owner).register(assetAAddress, resolver.address);
      await registry.connect(owner).register(assetBAddress, resolver.address);
      expect(await registry.resolvers(assetAAddress)).to.be.eq(
        resolver.address
      );

      await registry.connect(owner).banResolver(resolver.address);
      expect(await registry.bannedResolvers(resolver.address)).to.be.eq(true);
    });

    it('unban resolver with assets', async function () {
      await expect(
        registry.connect(user).resolvers(assetAAddress)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');

      await expect(
        registry.connect(user).resolvers(assetBAddress)
      ).to.be.revertedWith('AssetRegistry: resolver is banned');

      await expect(registry.connect(owner).unbanResolver(resolver.address))
        .to.emit(registry, 'unbannedResolver')
        .withArgs(resolver.address);

      expect(await registry.bannedResolvers(resolver.address)).to.be.eq(false);

      expect(await registry.resolvers(assetAAddress)).to.be.eq(
        resolver.address
      );

      expect(await registry.resolvers(assetBAddress)).to.be.eq(
        resolver.address
      );
    });

    it('should revert: resolver is not banned', async function () {
      await registry.connect(owner).unbanResolver(resolver.address);
      await expect(
        registry.connect(owner).unbanResolver(resolver.address)
      ).to.be.revertedWith('AssetRegistry: resolver is not banned');
    });

    it('should revert: asset zero address', async function () {
      await expect(
        registry.connect(owner).unbanResolver(constants.AddressZero)
      ).to.be.revertedWith('AssetRegistry: resolver zero address');
    });

    it('should revert: non-owner', async function () {
      await expect(
        registry.connect(user).unbanResolver(resolver.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
