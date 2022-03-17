import { Wallet, BigNumber } from 'ethers';
import { BigNumber as BigNumberJs } from 'bignumber.js';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { expectEqWithinBps, increaseNextBlockTimeBy } from './utils/utils';
import { FEE_BASE } from './utils/constants';

import { ManagementFeeModuleMock, ShareToken } from '../typechain';

describe('Management fee', function () {
  let mFeeModule: ManagementFeeModuleMock;
  let user: Wallet;
  let manager: Wallet;
  let tokenS: ShareToken;
  let feeBase: BigNumber;

  const totalShare = ethers.utils.parseEther('100');
  const FEE_BASE64x64 = BigNumber.from(2).pow(64);

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user, manager] = await (ethers as any).getSigners();
      mFeeModule = await (
        await ethers.getContractFactory('ManagementFeeModuleMock')
      )
        .connect(user)
        .deploy();
      await mFeeModule.deployed();
      tokenS = await (await ethers.getContractFactory('ShareToken'))
        .connect(user)
        .deploy('ShareToken', 'SHT', 18);
      await tokenS.deployed();
      // initialize
      await mFeeModule.setShareToken(tokenS.address);
      await mFeeModule.setManager(manager.address);
      await tokenS.transferOwnership(mFeeModule.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
    feeBase = await mFeeModule.callStatic.getFeeBase();
  });

  // Lack of precision
  function getEffectiveFeeRate(feeRate: any) {
    const effRate = new BigNumberJs(
      Math.exp((-1 * Math.log(1 - feeRate)) / (365.25 * 24 * 60 * 60))
    );
    return BigNumber.from(
      effRate
        .times(new BigNumberJs(FEE_BASE64x64.toString()))
        .toFixed(0)
        .toString()
    );
  }

  describe('set management fee rate', function () {
    it('should success when zero', async function () {
      const feeRate = BigNumber.from('0');
      const result = FEE_BASE64x64;
      await mFeeModule.setManagementFeeRate(feeRate);
      await mFeeModule.initializeManagementFee();
      const effectiveFeeRate =
        await mFeeModule.callStatic.getManagementFeeRate();
      expect(effectiveFeeRate).to.eq(result);
    });

    it('should success in normal range', async function () {
      const feeRate = BigNumber.from('1000');
      const result = getEffectiveFeeRate(feeRate.toNumber() / FEE_BASE);
      await mFeeModule.setManagementFeeRate(feeRate);
      await mFeeModule.initializeManagementFee();
      const effectiveFeeRate =
        await mFeeModule.callStatic.getManagementFeeRate();
      expectEqWithinBps(effectiveFeeRate, result, 1, 15);
    });

    it('should fail when equal to 100%', async function () {
      await expect(mFeeModule.setManagementFeeRate(feeBase)).to.be.reverted;
    });
  });

  describe('claim management fee', function () {
    beforeEach(async function () {
      await mFeeModule.mintShareToken(user.address, totalShare);
    });

    it('should not generate fee when rate is 0', async function () {
      const feeRate = BigNumber.from('0');
      await mFeeModule.setManagementFeeRate(feeRate);
      await mFeeModule.initializeManagementFee();
      await mFeeModule.claimManagementFee();
      const feeClaimed = await tokenS.callStatic.balanceOf(manager.address);
      expect(feeClaimed).to.be.eq(BigNumber.from('0'));
    });

    it('should generate fee when rate is not 0', async function () {
      const feeRate = BigNumber.from('200');
      const expectAmount = totalShare
        .mul(feeBase)
        .div(feeBase.sub(feeRate))
        .sub(totalShare);
      await mFeeModule.setManagementFeeRate(feeRate);
      await mFeeModule.initializeManagementFee();
      await increaseNextBlockTimeBy(365.25 * 24 * 60 * 60);
      await expect(mFeeModule.claimManagementFee()).to.emit(
        mFeeModule,
        'ManagementFeeClaimed'
      );

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
      await mFeeModule.setManagementFeeRate(feeRate);
      await mFeeModule.initializeManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await mFeeModule.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await mFeeModule.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await mFeeModule.claimManagementFee();
      await increaseNextBlockTimeBy(365.25 * 6 * 60 * 60);
      await mFeeModule.claimManagementFee();
      const feeClaimed = await tokenS.callStatic.balanceOf(manager.address);
      expect(feeClaimed).to.be.gt(expectAmount.mul(999).div(1000));
      expect(feeClaimed).to.be.lt(expectAmount.mul(1001).div(1000));
    });
  });
});
