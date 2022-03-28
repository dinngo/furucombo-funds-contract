import { expect } from 'chai';
import { constants, Wallet, BigNumber } from 'ethers';

import { ethers, deployments } from 'hardhat';

import {
  PoolProxyFactory,
  ComptrollerImplementation,
  ComptrollerProxy,
  ComptrollerProxyAdmin,
  PoolImplementation,
  Chainlink,
  AssetRegistry,
  SimpleToken,
  AssetRouter,
  MortgageVault,
  PoolProxy,
} from '../typechain';

import {
  DS_PROXY_REGISTRY,
  FEE_BASE,
  POOL_STATE,
  USDC_TOKEN,
} from './utils/constants';
import { getEventArgs } from './utils/utils';

describe('PoolProxyFactory', function () {
  let owner: Wallet;
  let user: Wallet;
  let manager: Wallet;
  let collector: Wallet;
  let liquidator: Wallet;

  const denominationAddress = USDC_TOKEN;
  const level = 1;
  const stakeAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const crystallizationPeriod = 1;
  const reserveExecutionRatio = 0;
  const shareTokenName = 'TEST';
  const dust = BigNumber.from('10');

  let comptrollerImplementation: ComptrollerImplementation;
  let comptrollerProxy: ComptrollerProxy;
  let comptrollerProxyAdmin: ComptrollerProxyAdmin;
  let comptroller: ComptrollerImplementation;
  let poolImplementation: PoolImplementation;
  let poolProxyFactory: PoolProxyFactory;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenM: SimpleToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture('');
      [owner, user, manager, collector, liquidator] = await (
        ethers as any
      ).getSigners();

      // deploy for comptroller
      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await assetRouter.deployed();

      tokenM = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenM.deployed();

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(tokenM.address);
      await mortgageVault.deployed();

      poolImplementation = await (
        await ethers.getContractFactory('PoolImplementation')
      ).deploy(DS_PROXY_REGISTRY);
      await poolImplementation.deployed();

      comptrollerImplementation = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).deploy();
      await comptrollerImplementation.deployed();

      const compData = comptrollerImplementation.interface.encodeFunctionData(
        'initialize',
        [
          poolImplementation.address,
          assetRouter.address,
          collector.address,
          0,
          liquidator.address,
          0,
          mortgageVault.address,
          0,
        ]
      );

      comptrollerProxy = await (
        await ethers.getContractFactory('ComptrollerProxy')
      ).deploy(comptrollerImplementation.address, compData);
      await comptrollerProxy.deployed();
      const receiptAdmin = comptrollerProxy.deployTransaction;
      const args = await getEventArgs(receiptAdmin, 'AdminChanged');

      comptrollerProxyAdmin = await (
        await ethers.getContractFactory('ComptrollerProxyAdmin')
      ).attach(args.newAdmin);

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).attach(comptrollerProxy.address);

      // deploy poolProxyFactory
      poolProxyFactory = await (
        await ethers.getContractFactory('PoolProxyFactory')
      )
        .connect(owner)
        .deploy(comptroller.address);
      await poolProxyFactory.deployed();

      await comptroller.permitCreators([manager.address]);
      await comptroller.permitDenominations([denominationAddress], [dust]);
      await comptroller.setStakedTier(level, stakeAmount);
    }
  );
  beforeEach(async function () {
    await setupTest();
  });
  describe('create pool', function () {
    it('with valid params', async function () {
      const receipt = await poolProxyFactory
        .connect(manager)
        .createPool(
          denominationAddress,
          level,
          mFeeRate,
          pFeeRate,
          crystallizationPeriod,
          reserveExecutionRatio,
          shareTokenName
        );

      const eventArgs = await getEventArgs(receipt, 'PoolCreated');
      const poolProxy = await ethers.getContractAt(
        'PoolImplementation',
        eventArgs.newPool
      );
      expect(await poolProxy.state()).to.be.eq(POOL_STATE.REVIEWING);
    });
    it('should revert: invalid denomination address', async function () {
      const invalidDenominationAddress = constants.AddressZero;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            invalidDenominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.revertedWith('revertCode(79)'); //POOL_PROXY_FACTORY_INVALID_DENOMINATION
    });
    it('should revert: invalid creator', async function () {
      const invalidCreator = collector;
      await expect(
        poolProxyFactory
          .connect(invalidCreator)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.revertedWith('revertCode(13)'); //POOL_PROXY_FACTORY_INVALID_CREATOR
    });
    it('should revert: invalid level', async function () {
      const invalidLevel = 0;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            invalidLevel,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.revertedWith('revertCode(75)'); //POOL_PROXY_FACTORY_INVALID_STAKED_TIER
    });
    it('should revert: invalid management fee rate', async function () {
      const invalidMFeeRate = FEE_BASE;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            invalidMFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid performance fee rate', async function () {
      const invalidPFeeRate = FEE_BASE;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            invalidPFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid crystallization period', async function () {
      const invalidCrystallizationPeriod = 0;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            invalidCrystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid reserve execution ratio', async function () {
      const invalidReserveExecutionRate = FEE_BASE;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            invalidReserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
  });
});
