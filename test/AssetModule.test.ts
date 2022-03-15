import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { Comptroller, AssetModuleMock, SimpleToken } from '../typechain';
import { DS_PROXY_REGISTRY, POOL_STATE } from './utils/constants';

describe('Asset module', function () {
  let comptroller: Comptroller;
  let assetModule: AssetModuleMock;
  let user: Wallet;
  let tokenD: SimpleToken;
  let token0: SimpleToken;
  let token1: SimpleToken;
  let token2: SimpleToken;
  let vault: any;

  const assetAmount = ethers.utils.parseEther('1');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user] = await (ethers as any).getSigners();
      assetModule = await (await ethers.getContractFactory('AssetModuleMock'))
        .connect(user)
        .deploy(DS_PROXY_REGISTRY);
      await assetModule.deployed();

      comptroller = await (
        await ethers.getContractFactory('Comptroller')
      ).deploy(
        assetModule.address,
        constants.AddressZero,
        constants.AddressZero,
        0,
        constants.AddressZero,
        0,
        constants.AddressZero,
        0
      );
      await comptroller.deployed();
      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();
      token0 = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await token0.deployed();
      token1 = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await token1.deployed();
      token2 = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await token2.deployed();
      // initialize
      await assetModule.setComptroller(comptroller.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await assetModule.setDenomination(tokenD.address);
      await assetModule.setShare();
      await assetModule.setVault();
      vault = await assetModule.callStatic.vault();
    }
  );

  beforeEach(async function () {
    await setupTest();
    await tokenD.approve(assetModule.address, constants.MaxUint256);
  });

  describe('add asset', function () {
    beforeEach(async function () {
      await assetModule.setState(POOL_STATE.EXECUTING);
    });

    it('should success when asset is not in the list', async function () {
      await expect(assetModule.addAsset(token0.address))
        .to.emit(assetModule, 'AssetAdded')
        .withArgs(token0.address);
    });

    it('should non-revert when asset is in the list', async function () {
      await assetModule.addAsset(token0.address);
      await assetModule.addAsset(token0.address);
      expect(await assetModule.callStatic.getAssetList()).to.be.deep.eq([
        token0.address,
      ]);
    });
  });

  describe('remove asset', function () {
    beforeEach(async function () {
      await assetModule.setState(POOL_STATE.EXECUTING);
    });

    it('should success when asset is in the list', async function () {
      await assetModule.addAsset(token0.address);
      await expect(assetModule.removeAsset(token0.address))
        .to.emit(assetModule, 'AssetRemoved')
        .withArgs(token0.address);
    });

    it('should non-revert when asset is not in the list', async function () {
      await assetModule.removeAsset(token0.address);
      expect(await assetModule.callStatic.getAssetList()).to.be.deep.eq([]);
    });
  });

  describe('close', function () {
    describe('when executing', function () {
      beforeEach(async function () {
        await assetModule.setState(POOL_STATE.EXECUTING);
      });

      it('should success when denomination asset is the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await expect(assetModule.close())
          .to.emit(assetModule, 'StateTransited')
          .withArgs(POOL_STATE.CLOSED);
      });

      it('should fail when denomination asset is not the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });

      it('should fail when denomination asset is not in the asset list', async function () {
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });
    });

    describe('when liquidating', function () {
      beforeEach(async function () {
        await assetModule.setState(POOL_STATE.LIQUIDATING);
      });

      it('should success when denomination asset is the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await expect(assetModule.close())
          .to.emit(assetModule, 'StateTransited')
          .withArgs(POOL_STATE.CLOSED);
      });

      it('should fail when denomination asset is not the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });

      it('should fail when denomination asset is not in the asset list', async function () {
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });
    });

    it('should fail when not Executing or Liquidating', async function () {
      await assetModule.setState(POOL_STATE.REDEMPTION_PENDING);
      await assetModule.addAsset(tokenD.address);
      await expect(assetModule.close()).to.be.revertedWith('InvalidState(3)');
    });
  });

  describe('get asset list', function () {
    beforeEach(async function () {
      await assetModule.setState(POOL_STATE.EXECUTING);
      await assetModule.addAsset(tokenD.address);
      await assetModule.addAsset(token0.address);
      await assetModule.addAsset(token1.address);
    });

    it('should show the added assets', async function () {
      await assetModule.addAsset(token2.address);
      const assetList = [
        tokenD.address,
        token0.address,
        token1.address,
        token2.address,
      ];
      expect(await assetModule.callStatic.getAssetList()).to.be.deep.eq(
        assetList
      );
    });

    it('should not show the removed asset', async function () {
      await assetModule.removeAsset(token1.address);
      const assetList = [tokenD.address, token0.address];
      expect(await assetModule.callStatic.getAssetList()).to.be.deep.eq(
        assetList
      );
    });
  });

  it('get reserve', async function () {
    await tokenD.transfer(vault, assetAmount);
    expect(await assetModule.callStatic.getReserve()).to.be.eq(assetAmount);
  });
});
