import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { PerformanceFeeModuleMock, ShareToken } from '../typechain';
import { DS_PROXY_REGISTRY, FEE_BASE } from './utils/constants';
import { get64x64FromNumber, expectEqWithinBps } from './utils/utils';

/// @notice increase the block time need mine block,
/// the next view function will be correct.
async function increaseNextBlockTimeBy(interval: number) {
  const blockNumber = await ethers.provider.getBlockNumber();
  let block = null;
  for (let i = 0; block == null; i++) {
    block = await ethers.provider.getBlock(blockNumber - i);
  }
  const jsonRpc = new ethers.providers.JsonRpcProvider();
  await jsonRpc.send('evm_setNextBlockTimestamp', [block.timestamp + interval]);
  await jsonRpc.send('evm_mine', []);
}

describe('Performance fee', function () {
  let pFeeModule: PerformanceFeeModuleMock;
  let user: Wallet;
  let manager: Wallet;
  let tokenS: ShareToken;
  let feeBase: BigNumber;

  const totalShare = ethers.utils.parseEther('100');
  const outstandingAccount = '0x0000000000000000000000000000000000000001';

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [user, manager] = await (ethers as any).getSigners();
    pFeeModule = await (await ethers.getContractFactory('PerformanceFeeModuleMock')).connect(user).deploy();
    await pFeeModule.deployed();
    tokenS = await (await ethers.getContractFactory('ShareToken')).connect(user).deploy('ShareToken', 'SHT', 18);
    await tokenS.deployed();
    // initialize
    await pFeeModule.setShareToken(tokenS.address);
    await pFeeModule.transferOwnership(manager.address);
    await tokenS.transferOwnership(pFeeModule.address);
  });

  beforeEach(async function () {
    await setupTest();
    feeBase = await pFeeModule.getFeeBase();
  });

  describe('set performance fee rate', function () {
    it('zero', async function () {
      const feeRate = BigNumber.from('0');
      await pFeeModule.setPerformanceFeeRate(feeRate);
      const result = await pFeeModule.pFeeRate64x64();
      expect(result).to.be.eq(BigNumber.from('0'));
    });

    it('in normal range', async function () {
      const feeRate = BigNumber.from('1000');
      await pFeeModule.setPerformanceFeeRate(feeRate);
      const result = await pFeeModule.pFeeRate64x64();
      expect(result).to.be.eq(get64x64FromNumber(feeRate.toNumber() / FEE_BASE));
    });

    it('should revert: equal to 100%', async function () {
      await expect(pFeeModule.setPerformanceFeeRate(feeBase)).to.be.reverted;
    });
  });

  describe('set crystallization period', function () {
    it('in normal range', async function () {
      const period = BigNumber.from(30 * 24 * 60 * 60);
      await pFeeModule.setCrystallizationPeriod(period);
      const result = await pFeeModule.crystallizationPeriod();
      expect(result).to.be.eq(period);
    });

    it('should revert: equal to 0', async function () {
      await expect(pFeeModule.setCrystallizationPeriod(0)).to.be.revertedWith('C');
    });
  });

  describe('get crystallize time', function () {
    const period = BigNumber.from(4 * 30 * 24 * 60 * 60);
    let startTime: BigNumber;

    beforeEach(async function () {
      await pFeeModule.setCrystallizationPeriod(period);
      const receipt = await pFeeModule.initializePerformanceFee();
      const block = await ethers.provider.getBlock(receipt.blockNumber!);
      startTime = BigNumber.from(block.timestamp);
    });

    it('shoud return next period time before period', async function () {
      await increaseNextBlockTimeBy(period.toNumber() * 0.4);
      const isCrystallizable = await pFeeModule.isCrystallizable();
      const nextCrystallizeTime = await pFeeModule.getNextCrystallizationTime();
      expect(isCrystallizable).to.be.eq(false);
      expect(nextCrystallizeTime).to.be.eq(startTime.add(period));
    });

    it('shoud return next period time after period', async function () {
      await increaseNextBlockTimeBy(period.toNumber() * 1.8);
      const isCrystallizable = await pFeeModule.isCrystallizable();
      const nextCrystallizeTime = await pFeeModule.getNextCrystallizationTime();
      expect(isCrystallizable).to.be.eq(true);
      expect(nextCrystallizeTime).to.be.eq(startTime.add(period));
    });

    it('shoud return earliest next period time at next period', async function () {
      await increaseNextBlockTimeBy(period.toNumber() * 2.2);
      const isCrystallizable = await pFeeModule.isCrystallizable();
      const nextCrystallizeTime = await pFeeModule.getNextCrystallizationTime();
      expect(isCrystallizable).to.be.eq(true);
      expect(nextCrystallizeTime).to.be.eq(startTime.add(period));
    });
  });

  describe('performance fee calculation', function () {
    const period = BigNumber.from(4 * 30 * 24 * 60 * 60);
    const grossAssetValue = totalShare;

    beforeEach(async function () {
      await pFeeModule.setCrystallizationPeriod(period);
      await pFeeModule.setGrossAssetValue(grossAssetValue);
      await pFeeModule.mintShareToken(user.address, totalShare);
    });

    describe('update performance fee', function () {
      let feeRate: BigNumber;
      let growth: BigNumber;
      let currentGrossAssetValue: BigNumber;

      it('should not update fee when rate is 0', async function () {
        feeRate = BigNumber.from('0');
        growth = grossAssetValue;
        currentGrossAssetValue = grossAssetValue.add(growth);
        await pFeeModule.setPerformanceFeeRate(feeRate);
        await pFeeModule.initializePerformanceFee();
        await pFeeModule.setGrossAssetValue(currentGrossAssetValue);
        await pFeeModule.updatePerformanceFee();
        const outstandingShare = await tokenS.balanceOf('0x0000000000000000000000000000000000000001');
        expect(outstandingShare).to.be.eq(BigNumber.from('0'));
      });

      it('update fee when fee rate is valid', async function () {
        feeRate = BigNumber.from('1000');
        growth = grossAssetValue;
        currentGrossAssetValue = grossAssetValue.add(growth);
        await pFeeModule.setPerformanceFeeRate(feeRate);
        await pFeeModule.initializePerformanceFee();
        await pFeeModule.setGrossAssetValue(currentGrossAssetValue);
        await pFeeModule.updatePerformanceFee();
        const outstandingShare = await tokenS.balanceOf(outstandingAccount);

        const fee = growth.mul(feeRate).div(feeBase);
        const expectShare = fee.mul(totalShare).div(currentGrossAssetValue.sub(fee));
        expectEqWithinBps(outstandingShare, expectShare, 10);
      });

      describe('crystallization', function () {
        beforeEach(async function () {
          feeRate = BigNumber.from('1000');
          growth = grossAssetValue;
          currentGrossAssetValue = grossAssetValue.add(growth);
          await pFeeModule.setPerformanceFeeRate(feeRate);
          await pFeeModule.initializePerformanceFee();
          await pFeeModule.setGrossAssetValue(currentGrossAssetValue);
        });

        it('should not get fee when crystallization before period', async function () {
          await increaseNextBlockTimeBy(period.toNumber() * 0.4);
          const highWaterMarkBefore = await pFeeModule.hwm64x64();
          await expect(pFeeModule.crystallize()).to.be.revertedWith('RevertCode(67)'); // PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET;
          await pFeeModule.updatePerformanceFee();
          const shareManager = await tokenS.balanceOf(manager.address);
          expect(shareManager).to.be.eq(BigNumber.from(0));
          const highWaterMarkAfter = await pFeeModule.hwm64x64();
          expect(highWaterMarkAfter).to.be.eq(highWaterMarkBefore);
        });

        it('should get fee when crystallization after period', async function () {
          await increaseNextBlockTimeBy(period.toNumber());
          const highWaterMarkBefore = await pFeeModule.hwm64x64();
          await expect(pFeeModule.crystallize()).to.emit(pFeeModule, 'PerformanceFeeClaimed');
          const highWaterMarkAfter = await pFeeModule.hwm64x64();
          const shareManager = await tokenS.balanceOf(manager.address);
          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee.mul(totalShare).div(currentGrossAssetValue.sub(fee));
          const lastPrice = await pFeeModule.lastGrossSharePrice64x64();
          const expectPrice = highWaterMarkBefore.mul(feeBase.mul(2).sub(feeRate)).div(feeBase);

          expectEqWithinBps(shareManager, expectShare, 10);
          expect(highWaterMarkAfter).to.be.eq(lastPrice);
          expectEqWithinBps(highWaterMarkAfter, expectPrice, 10);
        });

        it('should get fee when crystallization at next period', async function () {
          await increaseNextBlockTimeBy(period.toNumber() * 1.8);
          await pFeeModule.crystallize();
          await increaseNextBlockTimeBy(period.toNumber() * 0.4);
          const highWaterMarkBefore = await pFeeModule.hwm64x64();
          await pFeeModule.crystallize();
          const highWaterMarkAfter = await pFeeModule.hwm64x64();
          const shareManager = await tokenS.balanceOf(manager.address);
          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee.mul(totalShare).div(currentGrossAssetValue.sub(fee));
          const lastPrice = await pFeeModule.lastGrossSharePrice64x64();
          expectEqWithinBps(shareManager, expectShare, 10);
          expect(highWaterMarkAfter).to.be.eq(lastPrice);
        });

        it('should get fee when crystallization after period', async function () {
          await increaseNextBlockTimeBy(period.toNumber());
          const highWaterMarkBefore = await pFeeModule.hwm64x64();
          await pFeeModule.crystallize();
          const highWaterMarkAfter = await pFeeModule.hwm64x64();
          const shareManager = await tokenS.balanceOf(manager.address);
          const fee = growth.mul(feeRate).div(feeBase);
          const expectShare = fee.mul(totalShare).div(currentGrossAssetValue.sub(fee));
          const lastPrice = await pFeeModule.lastGrossSharePrice64x64();
          const expectPrice = highWaterMarkBefore.mul(feeBase.mul(2).sub(feeRate)).div(feeBase);

          expectEqWithinBps(shareManager, expectShare, 10);
          expect(highWaterMarkAfter).to.be.eq(lastPrice);
          expectEqWithinBps(highWaterMarkAfter, expectPrice, 10);
        });
      });
    });
  });
});
