import { Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { AMock } from '../typechain';
import { DAI_TOKEN, WBTC_TOKEN } from './utils/constants';

describe('DealingAssetAction', function () {
  let owner: Wallet;
  let user: Wallet;

  let action: AMock;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    action = await (await ethers.getContractFactory('AMock')).deploy();
    await action.deployed();
  });

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('asset operation', function () {
    const tokenA = DAI_TOKEN;
    const tokenB = WBTC_TOKEN;
    it('add asset', async function () {
      // Prepare action data
      await action.doAddDealingAsset(tokenA);

      // Verify
      expect(await action.doGetLength()).to.be.eq(1);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(true);
    });

    it('add multiple assets', async function () {
      // Prepare action data
      await action.doAddDealingAsset(tokenA);
      await action.doAddDealingAsset(tokenB);

      // Verify
      expect(await action.doGetLength()).to.be.eq(2);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(true);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(true);
    });

    it('add repeat assets', async function () {
      // Prepare action data
      await action.doAddDealingAsset(tokenA);
      await action.doAddDealingAsset(tokenA);
      await action.doAddDealingAsset(tokenB);

      // Verify
      expect(await action.doGetLength()).to.be.eq(2);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(true);
      expect(await action.doIsDealingAssetExist(tokenB)).to.be.eq(true);
    });

    it('get assets list', async function () {
      // Prepare action data
      await action.doAddDealingAsset(tokenA);
      await action.doAddDealingAsset(tokenB);

      // Verify
      const assets = await action.doGetDealingAssets();
      expect(await action.doGetLength()).to.be.eq(2);
      expect(assets[0]).to.be.eq(tokenA);
      expect(assets[1]).to.be.eq(tokenB);
    });

    it('clean assets', async function () {
      // Prepare action data
      await action.doAddDealingAsset(tokenA);
      await action.doAddDealingAsset(tokenB);

      // Execution
      await action.doCleanAssets();

      // Verify
      expect(await action.doGetLength()).to.be.eq(0);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(false);
      expect(await action.doIsDealingAssetExist(tokenB)).to.be.eq(false);
    });

    it('asset clean up', async function () {
      // Prepare action data

      // Execution
      await action.doAssetCleanUp(tokenA);

      // Verify
      expect(await action.doGetLength()).to.be.eq(0);
      expect(await action.doIsDealingAssetExist(tokenA)).to.be.eq(false);
      expect(await action.doIsDealingAssetExist(tokenB)).to.be.eq(false);
    });
  });
});
