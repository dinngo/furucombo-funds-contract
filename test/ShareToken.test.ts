import { BigNumber, Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { ShareToken } from '../typechain';
import { ether } from './utils/utils';

describe('ShareToken', function () {
  let shareToken: ShareToken;
  let user1: Wallet;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [user1] = await (ethers as any).getSigners();

    shareToken = await (
      await ethers.getContractFactory('ShareToken')
    ).deploy('share token', 'SHARE', BigNumber.from(18));
    await shareToken.deployed();
    await shareToken.mint(user1.address, ether('100'));
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('beforeTokenTransfer', function () {
    it('should revert: invalid to address(1)', async function () {
      await expect(shareToken.transfer('0x0000000000000000000000000000000000000001', ether('1'))).to.be.revertedWith(
        'RevertCode(6)'
      ); // SHARE_TOKEN_INVALID_TO
    });
  });
});
