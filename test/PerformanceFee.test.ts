import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { PerformanceFeeMock, ShareToken } from '../typechain';
import { DS_PROXY_REGISTRY } from './utils/constants';

async function increaseNextBlockTimeBy(interval: number) {
  const blockNumber = await ethers.provider.getBlockNumber();
  let block = null;
  for (let i = 0; block == null; i++) {
    block = await ethers.provider.getBlock(blockNumber - i);
  }
  const jsonRpc = new ethers.providers.JsonRpcProvider();
  await jsonRpc.send('evm_setNextBlockTimestamp', [block.timestamp + interval]);
}

describe('Performance fee', function () {
  let performanceFee: PerformanceFeeMock;
  let user: Wallet;
  let manager: Wallet;
  let tokenS: ShareToken;
  let feeBase: BigNumber;

  const totalShare = ethers.utils.parseEther('100');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user, manager] = await (ethers as any).getSigners();
      performanceFee = await (
        await ethers.getContractFactory('PerformanceFeeMock')
      )
        .connect(user)
        .deploy();
      await performanceFee.deployed();
      tokenS = await (await ethers.getContractFactory('ShareToken'))
        .connect(user)
        .deploy('ShareToken', 'SHT');
      await tokenS.deployed();
      // initialize
      await performanceFee.setShareToken(tokenS.address);
      await performanceFee.setManager(manager.address);
      await tokenS.transferOwnership(performanceFee.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
    feeBase = await performanceFee.callStatic.getFeeBase();
  });

  describe('set performance fee rate', function () {
    it('should success when zero', async function () {
      const feeRate = BigNumber.from('0');
      await performanceFee.setPerformanceFeeRate(feeRate);
      const result = await performanceFee.callStatic.getFeeRate();
      expect(result).to.be.eq(BigNumber.from('0'));
    });

    it('should success in normal range', async function () {
      const feeRate = BigNumber.from('1000');
      await performanceFee.setPerformanceFeeRate(feeRate);
      const result = await performanceFee.callStatic.getFeeRate();
      expect(result).to.be.eq(BigNumber.from('1844674407370955161'));
    });

    it('should fail when equal to 100%', async function () {
      await expect(performanceFee.setPerformanceFeeRate(feeBase)).to.be
        .reverted;
    });
  });

  describe('set crystallization period', function () {
    it('should success', async function () {
      const period = BigNumber.from(30 * 24 * 60 * 60);
      await performanceFee.setCrystallizationPeriod(period);
      const result = await performanceFee.callStatic.getCrystallizationPeriod();
      expect(result).to.be.eq(period);
    });
  });

  describe('performance fee calculation', function () {
    const period = BigNumber.from(4 * 30 * 24 * 60 * 60);
    const grossAssetValue = totalShare;

    beforeEach(async function () {
      await performanceFee.setCrystallizationPeriod(period);
      await performanceFee.setGrossAssetValue(grossAssetValue);
      await performanceFee.mintShareToken(user.address, totalShare);
    });

    describe('update performance fee', function () {
      let feeRate: BigNumber;
      let growth: BigNumber;
      let currentGrossAssetValue: BigNumber;

      it('should not update fee when rate is 0', async function () {
        feeRate = BigNumber.from('0');
        growth = grossAssetValue;
        currentGrossAssetValue = grossAssetValue.add(growth);
        await performanceFee.setPerformanceFeeRate(feeRate);
        await performanceFee.initializePerformanceFee();
        await performanceFee.setGrossAssetValue(currentGrossAssetValue);
        await performanceFee.updatePerformanceFee();
        const outstandingShare = await tokenS.callStatic.balanceOf(
          '0x0000000000000000000000000000000000000001'
        );
        expect(outstandingShare).to.be.eq(BigNumber.from('0'));
      });

      it('should update fee when fee rate is valid', async function () {
        feeRate = BigNumber.from('1000');
        growth = grossAssetValue;
        currentGrossAssetValue = grossAssetValue.add(growth);
        await performanceFee.setPerformanceFeeRate(feeRate);
        await performanceFee.initializePerformanceFee();
        await performanceFee.setGrossAssetValue(currentGrossAssetValue);
        await performanceFee.updatePerformanceFee();
        const outstandingShare = await tokenS.callStatic.balanceOf(
          '0x0000000000000000000000000000000000000001'
        );

        const fee = growth.mul(feeRate).div(feeBase);
        const expectShare = fee
          .mul(totalShare)
          .div(currentGrossAssetValue.sub(fee));
        expect(outstandingShare).to.be.gt(expectShare.mul(999).div(1000));
        expect(outstandingShare).to.be.lt(expectShare.mul(1001).div(1000));
      });

      describe('payout when redeem', function () {
        beforeEach(async function () {
          feeRate = BigNumber.from('1000');
          growth = grossAssetValue;
          currentGrossAssetValue = grossAssetValue.add(growth);
          await performanceFee.setPerformanceFeeRate(feeRate);
          await performanceFee.initializePerformanceFee();
          await performanceFee.setGrossAssetValue(currentGrossAssetValue);
        });

        it('should get fee when user redeem', async function () {
          const redeemShare = totalShare;
          await performanceFee.redemptionPayout(redeemShare);
          const shareManager = await tokenS.callStatic.balanceOf(
            manager.address
          );
          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee
            .mul(totalShare)
            .div(currentGrossAssetValue.sub(fee));
          expect(shareManager).to.be.gt(expectShare.mul(999).div(1000));
          expect(shareManager).to.be.lt(expectShare.mul(1001).div(1000));
        });

        // Might be wrong on calculation
        it('should get fee when user redeem separately', async function () {
          const redeemShare = totalShare.div(2);
          await performanceFee.redemptionPayout(redeemShare);
          await performanceFee.redemptionPayout(redeemShare);
          const shareManager = await tokenS.callStatic.balanceOf(
            manager.address
          );

          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee
            .mul(totalShare)
            .div(currentGrossAssetValue.sub(fee));
          expect(shareManager).to.be.lt(expectShare);
        });
      });

      describe('crystallization', function () {
        beforeEach(async function () {
          feeRate = BigNumber.from('1000');
          growth = grossAssetValue;
          currentGrossAssetValue = grossAssetValue.add(growth);
          await performanceFee.setPerformanceFeeRate(feeRate);
          await performanceFee.initializePerformanceFee();
          await performanceFee.setGrossAssetValue(currentGrossAssetValue);
        });

        it('should not get fee when crystallization before period', async function () {
          const highWaterMarkBefore =
            await performanceFee.callStatic.hwm64x64();
          await expect(performanceFee.crystallize()).to.be.revertedWith(
            'Not yet'
          );
          await performanceFee.updatePerformanceFee();
          const shareManager = await tokenS.callStatic.balanceOf(
            manager.address
          );
          expect(shareManager).to.be.eq(BigNumber.from(0));
          const highWaterMarkAfter = await performanceFee.callStatic.hwm64x64();
          expect(highWaterMarkAfter).to.be.eq(highWaterMarkBefore);
        });

        it('should get fee when crystallization after period', async function () {
          await increaseNextBlockTimeBy(period.toNumber());
          const highWaterMarkBefore =
            await performanceFee.callStatic.hwm64x64();
          await performanceFee.crystallize();
          const highWaterMarkAfter = await performanceFee.callStatic.hwm64x64();
          const shareManager = await tokenS.callStatic.balanceOf(
            manager.address
          );
          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee
            .mul(totalShare)
            .div(currentGrossAssetValue.sub(fee));
          const lastPrice =
            await performanceFee.callStatic.lastGrossSharePrice64x64();
          const expectPrice = highWaterMarkBefore
            .mul(feeBase.mul(2).sub(feeRate))
            .div(feeBase);
          expect(shareManager).to.be.gt(expectShare.mul(999).div(1000));
          expect(shareManager).to.be.lt(expectShare.mul(1001).div(1000));
          expect(highWaterMarkAfter).to.be.eq(lastPrice);
          expect(highWaterMarkAfter).to.be.gt(expectPrice.mul(999).div(1000));
          expect(highWaterMarkAfter).to.be.lt(expectPrice.mul(1001).div(1000));
        });
      });
    });
  });
});
