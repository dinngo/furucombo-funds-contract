import { Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { StorageArrayMock } from '../typechain';

describe('StorageArray', function () {
  let owner: Wallet;
  let storageArray: StorageArrayMock;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner] = await (ethers as any).getSigners();

    storageArray = await (await ethers.getContractFactory('StorageArrayMock')).deploy();
    await storageArray.deployed();
  });

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('storage array', function () {
    it('should revert: pop from empty array', async function () {
      // Execution
      await expect(storageArray.pop()).to.be.revertedWith(
        'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
      );
    });
  });
});
