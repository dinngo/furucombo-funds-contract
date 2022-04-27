import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { ComptrollerImplementation, AssetModuleMock, SimpleToken } from '../typechain';
import { DS_PROXY_REGISTRY, FUND_STATE, ASSET_CAPACITY } from './utils/constants';

describe('Asset module', function () {
  let comptroller: ComptrollerImplementation;
  let assetModule: AssetModuleMock;
  let user: Wallet;
  let tokenD: SimpleToken;
  let token0: SimpleToken;
  let token1: SimpleToken;
  let token2: SimpleToken;
  let vault: any;

  const assetAmount = ethers.utils.parseEther('1');

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [user] = await (ethers as any).getSigners();
    assetModule = await (await ethers.getContractFactory('AssetModuleMock')).connect(user).deploy(DS_PROXY_REGISTRY);
    await assetModule.deployed();

    comptroller = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
    await comptroller.deployed();
    tokenD = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await tokenD.deployed();
    token0 = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await token0.deployed();
    token1 = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await token1.deployed();
    token2 = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await token2.deployed();
    // initialize
    await assetModule.setComptroller(comptroller.address);
    await comptroller.permitDenominations([tokenD.address], [0]);
    await comptroller.setAssetCapacity(ASSET_CAPACITY);
    await assetModule.setDenomination(tokenD.address);
    await assetModule.setShare();
    await assetModule.setVault();
    vault = await assetModule.vault();
  });

  beforeEach(async function () {
    await setupTest();
    await tokenD.approve(assetModule.address, constants.MaxUint256);
  });

  describe('add asset', function () {
    beforeEach(async function () {
      await assetModule.setState(FUND_STATE.EXECUTING);
    });

    it('when asset is not in the list', async function () {
      await expect(assetModule.addAsset(token0.address)).to.emit(assetModule, 'AssetAdded').withArgs(token0.address);
    });

    it('non-revert when asset is in the list', async function () {
      await assetModule.addAsset(token0.address);
      await assetModule.addAsset(token0.address);
      expect(await assetModule.getAssetList()).to.be.deep.eq([token0.address]);
    });

    it('should revert: reach maximum asset capacity', async function () {
      await comptroller.setAssetCapacity(0);
      await expect(assetModule.addAsset(token0.address)).to.be.revertedWith('RevertCode(88)'); // ASSET_MODULE_FULL_ASSET_CAPACITY
    });
  });

  describe('remove asset', function () {
    beforeEach(async function () {
      await assetModule.setState(FUND_STATE.EXECUTING);
    });

    it('when asset is in the list', async function () {
      await assetModule.addAsset(token0.address);
      await expect(assetModule.removeAsset(token0.address))
        .to.emit(assetModule, 'AssetRemoved')
        .withArgs(token0.address);
    });

    it('non-revert when asset is not in the list', async function () {
      await assetModule.removeAsset(token0.address);
      expect(await assetModule.getAssetList()).to.be.deep.eq([]);
    });
  });

  describe('close', function () {
    describe('when executing', function () {
      beforeEach(async function () {
        await assetModule.setState(FUND_STATE.EXECUTING);
      });

      it('when denomination asset is the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await expect(assetModule.close()).to.emit(assetModule, 'StateTransited').withArgs(FUND_STATE.CLOSED);
      });

      it('should revert: when denomination asset is not the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });

      it('should revert: when denomination asset is not in the asset list', async function () {
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });
    });

    describe('when liquidating', function () {
      beforeEach(async function () {
        await assetModule.setState(FUND_STATE.LIQUIDATING);
      });

      it('when denomination asset is the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await expect(assetModule.close()).to.emit(assetModule, 'StateTransited').withArgs(FUND_STATE.CLOSED);
      });

      it('should revert: when denomination asset is not the only asset', async function () {
        await assetModule.addAsset(tokenD.address);
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });

      it('should revert: when denomination asset is not in the asset list', async function () {
        await assetModule.addAsset(token0.address);
        await expect(assetModule.close()).to.be.reverted;
      });
    });

    it('should revert: when not Executing or Liquidating', async function () {
      await assetModule.setState(FUND_STATE.PENDING);
      await assetModule.addAsset(tokenD.address);
      await expect(assetModule.close()).to.be.revertedWith('InvalidState(3)');
    });

    it('should revert: different asset remaining (asset list length > 1)', async function () {
      await assetModule.setState(FUND_STATE.LIQUIDATING);
      await assetModule.addAsset(token0.address);
      await assetModule.addAsset(token1.address);

      // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      await expect(assetModule.close()).to.be.revertedWith('RevertCode(64)');
    });
    it('should revert: different asset remaining (last asset is not denomination)', async function () {
      await assetModule.setState(FUND_STATE.LIQUIDATING);
      await assetModule.addAsset(token0.address);

      // ASSET_MODULE_DIFFERENT_ASSET_REMAINING
      await expect(assetModule.close()).to.be.revertedWith('RevertCode(64)');
    });
  });

  describe('get asset list', function () {
    beforeEach(async function () {
      await assetModule.setState(FUND_STATE.EXECUTING);
      await assetModule.addAsset(tokenD.address);
      await assetModule.addAsset(token0.address);
      await assetModule.addAsset(token1.address);
    });

    it('show the added assets', async function () {
      await assetModule.addAsset(token2.address);
      const assetList = [tokenD.address, token0.address, token1.address, token2.address];
      expect(await assetModule.getAssetList()).to.be.deep.eq(assetList);
    });

    it('not show the removed asset', async function () {
      await assetModule.removeAsset(token1.address);
      const assetList = [tokenD.address, token0.address];
      expect(await assetModule.getAssetList()).to.be.deep.eq(assetList);
    });
  });

  it('get reserve', async function () {
    await tokenD.transfer(vault, assetAmount);
    expect(await assetModule.getReserve()).to.be.eq(assetAmount);
  });
});
