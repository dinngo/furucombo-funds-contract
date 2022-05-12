import { expect } from 'chai';
import { constants, Wallet, BigNumber } from 'ethers';

import { ethers, deployments } from 'hardhat';

import {
  FundProxyFactory,
  ComptrollerImplementation,
  ComptrollerProxy,
  ComptrollerProxyAdmin,
  FundImplementation,
  Chainlink,
  AssetRegistry,
  SimpleToken,
  AssetRouter,
  MortgageVault,
} from '../typechain';

import { DS_PROXY_REGISTRY, FUND_PERCENTAGE_BASE, FUND_STATE, USDC_TOKEN } from './utils/constants';
import { getEventArgs } from './utils/utils';

describe('FundProxyFactory', function () {
  let owner: Wallet;
  let user: Wallet;
  let manager: Wallet;
  let collector: Wallet;
  let liquidator: Wallet;

  const denominationAddress = USDC_TOKEN;
  const level = 1;
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const crystallizationPeriod = 1;
  const shareTokenName = 'TEST';
  const dust = BigNumber.from('10');

  let comptrollerImplementation: ComptrollerImplementation;
  let comptrollerProxy: ComptrollerProxy;
  let comptrollerProxyAdmin: ComptrollerProxyAdmin;
  let comptroller: ComptrollerImplementation;
  let fundImplementation: FundImplementation;
  let fundProxyFactory: FundProxyFactory;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenM: SimpleToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [owner, user, manager, collector, liquidator] = await (ethers as any).getSigners();

    // deploy for comptroller
    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();

    assetRouter = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await assetRouter.deployed();

    tokenM = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await tokenM.deployed();

    mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(tokenM.address);
    await mortgageVault.deployed();

    fundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
    await fundImplementation.deployed();

    comptrollerImplementation = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
    await comptrollerImplementation.deployed();

    const setupAction = await (await ethers.getContractFactory('SetupAction')).deploy();
    await setupAction.deployed();

    const compData = comptrollerImplementation.interface.encodeFunctionData('initialize', [
      fundImplementation.address,
      assetRouter.address,
      collector.address,
      0,
      liquidator.address,
      0,
      mortgageVault.address,
      0,
      DS_PROXY_REGISTRY,
      setupAction.address,
    ]);

    comptrollerProxy = await (
      await ethers.getContractFactory('ComptrollerProxy')
    ).deploy(comptrollerImplementation.address, compData);
    await comptrollerProxy.deployed();
    const receiptAdmin = comptrollerProxy.deployTransaction;
    const args = await getEventArgs(receiptAdmin, 'AdminChanged');

    comptrollerProxyAdmin = await (await ethers.getContractFactory('ComptrollerProxyAdmin')).attach(args.newAdmin);

    comptroller = await (await ethers.getContractFactory('ComptrollerImplementation')).attach(comptrollerProxy.address);

    // deploy fundProxyFactory
    fundProxyFactory = await (await ethers.getContractFactory('FundProxyFactory'))
      .connect(owner)
      .deploy(comptroller.address);
    await fundProxyFactory.deployed();

    await comptroller.permitCreators([manager.address]);
    await comptroller.permitDenominations([denominationAddress], [dust]);
    await comptroller.setMortgageTier(level, mortgageAmount);
  });
  beforeEach(async function () {
    await setupTest();
  });
  describe('create fund', function () {
    it('with valid params', async function () {
      const receipt = await fundProxyFactory
        .connect(manager)
        .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName);
      const eventArgs = await getEventArgs(receipt, 'FundCreated');
      const fundProxy = await ethers.getContractAt('FundImplementation', eventArgs.newFund);
      const shareTokenAddress = await fundProxy.shareToken();
      const shareToken = await ethers.getContractAt('ShareToken', shareTokenAddress);
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.REVIEWING);
      expect(await fundProxyFactory.isFundCreated(fundProxy.address)).to.be.true;
    });
    it('should revert: invalid denomination address', async function () {
      const invalidDenominationAddress = constants.AddressZero;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(invalidDenominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(15)'); // FUND_PROXY_FACTORY_INVALID_DENOMINATION
    });
    it('should revert: invalid creator', async function () {
      const invalidCreator = collector;
      await expect(
        fundProxyFactory
          .connect(invalidCreator)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(14)'); // FUND_PROXY_FACTORY_INVALID_CREATOR
    });
    it('should revert: invalid level', async function () {
      const invalidLevel = 0;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, invalidLevel, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(16)'); // FUND_PROXY_FACTORY_INVALID_MORTGAGE_TIER
    });
    it('should revert: invalid management fee rate', async function () {
      const invalidMFeeRate = FUND_PERCENTAGE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, invalidMFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.reverted;
    });
    it('should revert: invalid performance fee rate', async function () {
      const invalidPFeeRate = FUND_PERCENTAGE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, invalidPFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.reverted;
    });
    it('should revert: invalid crystallization period', async function () {
      const invalidCrystallizationPeriod = 0;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, invalidCrystallizationPeriod, shareTokenName)
      ).to.be.reverted;
    });
  });
});
