import { Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { ActionMock } from '../typechain';
import { DAI_TOKEN, NATIVE_TOKEN, WBTC_TOKEN } from './utils/constants';
import { ether } from './utils/utils';

describe('AssetQuotaAction', function () {
  let owner: Wallet;
  let user: Wallet;
  let action: ActionMock;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    action = await (await ethers.getContractFactory('ActionMock')).deploy();
    await action.deployed();
  });

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('asset quota', function () {
    const tokenA = DAI_TOKEN;
    const tokenB = WBTC_TOKEN;
    const quota = ether('1');

    it('set quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(NATIVE_TOKEN, quota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(NATIVE_TOKEN)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(quota);
      expect(await action.doGetAssetQuota(NATIVE_TOKEN)).to.be.eq(quota);
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('increase quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(NATIVE_TOKEN, quota);

      // Execution
      await action.doIncreaseAssetQuota(tokenA, quota);
      await action.doIncreaseAssetQuota(NATIVE_TOKEN, quota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(NATIVE_TOKEN)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(quota.add(quota));
      expect(await action.doGetAssetQuota(NATIVE_TOKEN)).to.be.eq(quota.add(quota));
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('increase quota from zero qouta', async function () {
      // Execution
      await action.doIncreaseAssetQuota(tokenA, quota);
      await action.doIncreaseAssetQuota(NATIVE_TOKEN, quota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(NATIVE_TOKEN)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(quota);
      expect(await action.doGetAssetQuota(NATIVE_TOKEN)).to.be.eq(quota);
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('decrease quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(NATIVE_TOKEN, quota);

      // Execution
      const decreaseQuota = quota.div(BigNumber.from('2'));
      await action.doDecreaseAssetQuota(tokenA, decreaseQuota);
      await action.doDecreaseAssetQuota(NATIVE_TOKEN, decreaseQuota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(NATIVE_TOKEN)).to.be.eq(false);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(quota.sub(decreaseQuota));
      expect(await action.doGetAssetQuota(NATIVE_TOKEN)).to.be.eq(quota.sub(decreaseQuota));
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('decrease quota to zero', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(NATIVE_TOKEN, quota);

      // Execution
      await action.doDecreaseAssetQuota(tokenA, quota);
      await action.doDecreaseAssetQuota(NATIVE_TOKEN, quota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(true);
      expect(await action.doIsAssetQuotaZero(NATIVE_TOKEN)).to.be.eq(true);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(0);
      expect(await action.doGetAssetQuota(NATIVE_TOKEN)).to.be.eq(0);
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('should revert: insufficient quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);

      // Execution

      await expect(action.doDecreaseAssetQuota(tokenA, quota.add(BigNumber.from('1')))).to.be.revertedWith(
        'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
      );
    });

    it('clean asset quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(tokenB, quota);

      // Execution
      await action.doCleanAssetQuota();

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(true);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(0);
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });

    it('cleanup asset quota', async function () {
      // Prepare action data
      await action.doSetAssetQuota(tokenA, quota);
      await action.doSetAssetQuota(tokenB, quota);

      // Execution
      await action.doQuotaCleanUp(tokenA, quota);

      // Verify
      expect(await action.doIsAssetQuotaZero(tokenA)).to.be.eq(true);
      expect(await action.doIsAssetQuotaZero(tokenB)).to.be.eq(true);
      expect(await action.doGetAssetQuota(tokenA)).to.be.eq(0);
      expect(await action.doGetAssetQuota(tokenB)).to.be.eq(0);
    });
  });
});
