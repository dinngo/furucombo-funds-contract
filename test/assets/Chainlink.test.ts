import { expect } from 'chai';
import { deployments, ethers, network } from 'hardhat';
import { constants, utils, Wallet, BigNumber } from 'ethers';
import { Chainlink } from '../../typechain';

import {
  WETH_TOKEN,
  WBTC_TOKEN,
  USDC_TOKEN,
  CHAINLINK_ETH_USD,
  CHAINLINK_WBTC_USD,
  QUICKSWAP_FACTORY,
} from '../utils/constants';

import { expectEqWithinBps } from '../utils/utils';

describe('Chainlink', function () {
  const tokenA = WETH_TOKEN;
  const tokenB = WBTC_TOKEN;
  const aggregatorA = CHAINLINK_ETH_USD;
  const aggregatorB = CHAINLINK_WBTC_USD;
  const unsupportedToken = USDC_TOKEN;
  const uniLikeFactory = QUICKSWAP_FACTORY;

  let owner: Wallet;
  let user: Wallet;
  let chainlink: Chainlink;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [owner, user] = await (ethers as any).getSigners();

      chainlink = await (await ethers.getContractFactory('Chainlink'))
        .connect(owner)
        .deploy();
      await chainlink.deployed();
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Add assets', function () {
    it('normal', async function () {
      const receipt = await chainlink
        .connect(owner)
        .addAssets([tokenA, tokenB], [aggregatorA, aggregatorB]);
      await expect(receipt)
        .to.emit(chainlink, 'AssetAdded')
        .withArgs(tokenA, aggregatorA);
      await expect(receipt)
        .to.emit(chainlink, 'AssetAdded')
        .withArgs(tokenB, aggregatorB);
      expect(await chainlink.assetToAggregator(tokenA)).to.be.eq(aggregatorA);
      expect(await chainlink.assetToAggregator(tokenB)).to.be.eq(aggregatorB);
    });

    it('should revert: not owner', async function () {
      await expect(
        chainlink.connect(user).addAssets([], [])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: invalid length', async function () {
      await expect(
        chainlink.connect(owner).addAssets([], [aggregatorA])
      ).to.be.revertedWith('Invalid length');
    });

    it('should revert: zero address asset', async function () {
      await expect(
        chainlink
          .connect(owner)
          .addAssets([constants.AddressZero], [aggregatorA])
      ).to.be.reverted.revertedWith('Zero address');
    });

    it('should revert: zero address aggregator', async function () {
      await expect(
        chainlink.connect(owner).addAssets([tokenA], [constants.AddressZero])
      ).to.be.reverted.revertedWith('Zero address');
    });

    it('should revert: existing asset', async function () {
      await expect(
        chainlink
          .connect(owner)
          .addAssets([tokenA, tokenA], [aggregatorA, aggregatorB])
      ).to.be.revertedWith('Existing asset');
    });

    it('should revert: stale price', async function () {
      const stalePeriod = await chainlink.STALE_PERIOD();
      await network.provider.send('evm_increaseTime', [stalePeriod.toNumber()]);
      await network.provider.send('evm_mine', []);
      await expect(
        chainlink.connect(owner).addAssets([tokenA], [aggregatorA])
      ).to.be.revertedWith('Stale price');
    });
  });

  describe('Remove assets', function () {
    beforeEach(async function () {
      await chainlink
        .connect(owner)
        .addAssets([tokenA, tokenB], [aggregatorA, aggregatorB]);
    });

    it('normal', async function () {
      const receipt = await chainlink
        .connect(owner)
        .removeAssets([tokenA, tokenB]);
      await expect(receipt).to.emit(chainlink, 'AssetRemoved').withArgs(tokenA);
      await expect(receipt).to.emit(chainlink, 'AssetRemoved').withArgs(tokenB);
      expect(await chainlink.assetToAggregator(tokenA)).to.be.eq(
        constants.AddressZero
      );
      expect(await chainlink.assetToAggregator(tokenB)).to.be.eq(
        constants.AddressZero
      );
    });

    it('should revert: not owner', async function () {
      await expect(chainlink.connect(user).removeAssets([])).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('should revert: non-existent asset', async function () {
      await expect(
        chainlink.removeAssets([unsupportedToken])
      ).to.be.revertedWith('Non-existent asset');
    });
  });

  describe('Calculate quote amount', function () {
    let decimalsA: number;
    let decimalsB: number;
    let pairBalanceA: BigNumber;
    let pairBalanceB: BigNumber;

    beforeEach(async function () {
      await chainlink
        .connect(owner)
        .addAssets([tokenA, tokenB], [aggregatorA, aggregatorB]);

      // Get token decimals
      const ercA = await ethers.getContractAt('ERC20', tokenA);
      const ercB = await ethers.getContractAt('ERC20', tokenB);
      decimalsA = await ercA.decimals();
      decimalsB = await ercB.decimals();

      // Get AMM balance
      const factory = await ethers.getContractAt(
        'IUniswapV2Factory',
        uniLikeFactory
      );
      const pair = await factory.getPair(tokenA, tokenB);
      pairBalanceA = await ercA.balanceOf(pair);
      pairBalanceB = await ercB.balanceOf(pair);
    });

    it('normal: base is tokenA', async function () {
      // Get chainlink price
      const base = tokenA;
      const baseAmount = utils.parseUnits('1', decimalsA);
      const quote = tokenB;
      const chainlinkAmount = await chainlink.calcConversionAmount(
        base,
        baseAmount,
        quote
      );

      // Calculate AMM price
      const ammAmount = baseAmount.mul(pairBalanceB).div(pairBalanceA);

      expectEqWithinBps(chainlinkAmount, ammAmount, 100);
    });

    it('normal: base is tokenB', async function () {
      // Get chainlink price
      const base = tokenB;
      const baseAmount = utils.parseUnits('1', decimalsB);
      const quote = tokenA;
      const chainlinkAmount = await chainlink.calcConversionAmount(
        base,
        baseAmount,
        quote
      );

      // Calculate AMM price
      const ammAmount = baseAmount.mul(pairBalanceA).div(pairBalanceB);

      expectEqWithinBps(chainlinkAmount, ammAmount, 100);
    });

    it('should revert: zero amount', async function () {
      const base = tokenA;
      const baseAmount = constants.Zero;
      const quote = tokenB;

      await expect(
        chainlink.calcConversionAmount(base, baseAmount, quote)
      ).to.be.reverted.revertedWith('Zero amount');
    });

    it('should revert: unsupported asset', async function () {
      const base = unsupportedToken;
      const baseAmount = utils.parseUnits('1', decimalsA);
      const quote = tokenB;

      await expect(
        chainlink.calcConversionAmount(base, baseAmount, quote)
      ).to.be.reverted.revertedWith('Zero address');
    });

    it('should revert: stale price', async function () {
      const stalePeriod = await chainlink.STALE_PERIOD();
      const base = tokenA;
      const baseAmount = utils.parseUnits('1', decimalsA);
      const quote = tokenB;

      await network.provider.send('evm_increaseTime', [stalePeriod.toNumber()]);
      await network.provider.send('evm_mine', []);
      await expect(
        chainlink.calcConversionAmount(base, baseAmount, quote)
      ).to.be.revertedWith('Stale price');
    });
  });
});