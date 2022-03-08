import { Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { ManagementFeeMock, ShareToken } from '../typechain';
import { increaseNextBlockTimeBy } from './utils/utils';

describe('Management fee', function () {
  let managementFee: ManagementFeeMock;
  let user: Wallet;
  let manager: Wallet;
  let tokenS: ShareToken;
  let feeBase: BigNumber;

  const totalShare = ethers.utils.parseEther('100');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user, manager] = await (ethers as any).getSigners();
      managementFee = await (
        await ethers.getContractFactory('ManagementFeeMock')
      )
        .connect(user)
        .deploy();
      await managementFee.deployed();
      tokenS = await (await ethers.getContractFactory('ShareToken'))
        .connect(user)
        .deploy('ShareToken', 'SHT');
      await tokenS.deployed();
      // initialize
      await managementFee.setShareToken(tokenS.address);
      await managementFee.setManager(manager.address);
      await tokenS.transferOwnership(managementFee.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
    feeBase = await managementFee.callStatic.getFeeBase();
  });

  describe('set management fee rate', function () {
    it('should success when zero', async function () {
      const feeRate = BigNumber.from('0');
      await managementFee.setManagementFeeRate(feeRate);
      const effectiveFeeRate =
        await managementFee.callStatic.getManagementFeeRate();
      expect(effectiveFeeRate).to.eq(BigNumber.from('18446744073709551616'));
    });

    it('should success in normal range', async function () {
      const feeRate = BigNumber.from('1000');
      await managementFee.setManagementFeeRate(feeRate);
      const effectiveFeeRate =
        await managementFee.callStatic.getManagementFeeRate();
      expect(effectiveFeeRate).to.eq(BigNumber.from('18446744135297203117'));
    });

    it('should fail when equal to 100%', async function () {
      await expect(managementFee.setManagementFeeRate(feeBase)).to.be.reverted;
    });
  });

  describe('claim management fee', function () {
    beforeEach(async function () {
      await managementFee.mintShareToken(user.address, totalShare);
    });

    it('should not generate fee when rate is 0', async function () {
      const feeRate = BigNumber.from('0');
      await managementFee.setManagementFeeRate(feeRate);
      await managementFee.claimManagementFee();
      const feeClaimed = await tokenS.callStatic.balanceOf(manager.address);
      expect(feeClaimed).to.be.eq(BigNumber.from('0'));
    });

    it('should generate fee when rate is not 0', async function () {
      const feeRate = BigNumber.from('200');
      const expectAmount = totalShare
        .mul(feeBase)
        .div(feeBase.sub(feeRate))
        .sub(totalShare);
      await managementFee.setManagementFeeRate(feeRate);
      await increaseNextBlockTimeBy(365.25 * 24 * 60 * 60);
      await managementFee.claimManagementFee();
      const feeClaimed = await tokenS.callStatic.balanceOf(manager.address);
      expect(feeClaimed).to.be.gt(expectAmount.mul(999).div(1000));
      expect(feeClaimed).to.be.lt(expectAmount.mul(1001).div(1000));
    });

    it('should generate fee when rate is not 0 sep', async function () {
      const feeRate = BigNumber.from('200');
      const expectAmount = totalShare
        .mul(feeBase)
        .div(feeBase.sub(feeRate))
        .sub(totalShare);
      await managementFee.setManagementFeeRate(feeRate);
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await managementFee.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await managementFee.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await managementFee.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await managementFee.claimManagementFee();
      const feeClaimed = await tokenS.callStatic.balanceOf(manager.address);
      expect(feeClaimed).to.be.gt(expectAmount.mul(999).div(1000));
      expect(feeClaimed).to.be.lt(expectAmount.mul(1001).div(1000));
    });
  });
});
