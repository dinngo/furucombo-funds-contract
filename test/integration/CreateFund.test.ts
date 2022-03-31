import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';

import {
  FurucomboRegistry,
  FurucomboProxy,
  FundImplementation,
  IERC20,
  FundProxyFactory,
  MortgageVault,
  ComptrollerImplementation,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, getEventArgs } from '../utils/utils';

import { createFundInfra } from './fund';
import { deployFurucomboProxyAndRegistry, createFundProxy } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  FUND_STATE,
  ONE_DAY,
  FEE_BASE,
  ONE_YEAR,
  BAT_PROVIDER,
} from '../utils/constants';

describe('CreateFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let mortgageProvider: Signer;

  const denominationAddress = USDC_TOKEN;
  const mortgageProviderAddress = BAT_PROVIDER;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = mwei('10');
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRate = 5000; // 50%

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let fundProxyFactory: FundProxyFactory;
  let mortgageVault: MortgageVault;
  let fundProxy: FundImplementation;
  let comptrollerProxy: ComptrollerImplementation;

  let mortgage: IERC20;

  const setupCreateTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    mortgageProvider = await impersonateAndInjectEther(mortgageProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    [fundProxyFactory, , , , , , , mortgage, mortgageVault, , comptrollerProxy] = await createFundInfra(
      owner,
      collector,
      manager,
      liquidator,
      denominationAddress,
      mortgageAddress,
      tokenAAddress,
      tokenBAddress,
      denominationAggregator,
      tokenAAggregator,
      tokenBAggregator,
      level,
      mortgageAmount,
      execFeePercentage,
      pendingExpiration,
      valueTolerance,
      fRegistry,
      furucombo
    );
  });

  const setupFinalizeTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    mortgageProvider = await impersonateAndInjectEther(mortgageProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [fundProxyFactory, , , , , , , mortgage, mortgageVault] = await createFundInfra(
      owner,
      collector,
      manager,
      liquidator,
      denominationAddress,
      mortgageAddress,
      tokenAAddress,
      tokenBAddress,
      denominationAggregator,
      tokenAAggregator,
      tokenBAggregator,
      level,
      mortgageAmount,
      execFeePercentage,
      pendingExpiration,
      valueTolerance,
      fRegistry,
      furucombo
    );

    // Transfer mortgage token to manager
    await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);
    await mortgage.connect(manager).approve(mortgageVault.address, mortgageAmount);

    fundProxy = await createFundProxy(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecutionRate,
      shareTokenName
    );
  });
  beforeEach(async function () {
    // await setupTest();
  });

  describe('Create', function () {
    beforeEach(async function () {
      await setupCreateTest();
    });
    // create with normal params
    it('in reviewing state', async function () {
      const inititalMortgageBalance = await mortgage.balanceOf(manager.address);

      // Transfer mortgage token to manager
      await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);
      await mortgage.connect(manager).approve(mortgageVault.address, mortgageAmount);

      // Create and finalize furucombo fund
      const receipt = await fundProxyFactory
        .connect(manager)
        .createFund(
          denominationAddress,
          level,
          mFeeRate,
          pFeeRate,
          crystallizationPeriod,
          reserveExecutionRate,
          shareTokenName
        );
      const eventArgs = await getEventArgs(receipt, 'FundCreated');
      const fundProxy = await ethers.getContractAt('FundImplementation', eventArgs.newFund);
      expect(await fundProxy.state()).to.be.eq(FUND_STATE.REVIEWING);
      expect(await mortgage.balanceOf(manager.address)).to.be.eq(inititalMortgageBalance);
    });
    it('should revert: manager mortgage balance < stake amount', async function () {
      // approve mortgage
      await mortgage.connect(manager).approve(mortgageVault.address, mortgageAmount);
      // Create and finalize furucombo fund
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
    it('should revert: manager approve mortgage < stake amount', async function () {
      // Transfer mortgage token to manager
      await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);
      await mortgage.connect(manager).approve(mortgageVault.address, mortgageAmount.sub(1));

      // Create and finalize furucombo fund
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
    });
    it('should revert: invalid denomination address', async function () {
      const invalidDenominationAddress = constants.AddressZero;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            invalidDenominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid level', async function () {
      const level = 5;
      // Create and finalize furucombo fund
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid management fee rate', async function () {
      const mFeeRate = FEE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid performance fee rate', async function () {
      const pFeeRate = FEE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid crystallization period', async function () {
      const crystallizationPeriod = 0;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid reserve execution rate', async function () {
      const invalidReserveExecutionRate = FEE_BASE;
      await expect(
        createFundProxy(
          fundProxyFactory,
          manager,
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
    it('should revert: unset stake tier', async function () {
      await comptrollerProxy.unsetMortgageTier(level);
      await expect(
        createFundProxy(
          fundProxyFactory,
          manager,
          denominationAddress,
          level,
          mFeeRate,
          pFeeRate,
          crystallizationPeriod,
          reserveExecutionRate,
          shareTokenName
        )
      ).to.be.revertedWith('RevertCode(75');
    });
  });
  describe('Finalize', function () {
    beforeEach(async function () {
      await setupFinalizeTest();
    });
    describe('Getter', function () {
      // getter finalize getter
      it('get the right level value', async function () {
        expect(await fundProxy.level()).to.be.eq(level);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.level()).to.be.eq(level);
      });
      it('get the comptroller address', async function () {
        const _comptroller = await fundProxy.comptroller();
        expect(_comptroller).to.be.not.eq(constants.AddressZero);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.comptroller()).to.be.eq(_comptroller);
      });
      it('get the right denomination address', async function () {
        expect(await fundProxy.denomination()).to.be.eq(denominationAddress);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.denomination()).to.be.eq(denominationAddress);
      });
      it('get the share token address', async function () {
        const _shareToken = await fundProxy.shareToken();
        expect(_shareToken).to.be.not.eq(constants.AddressZero);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.shareToken()).to.be.eq(_shareToken);
      });
      it('get the right management fee rate', async function () {
        const _mFeeRate = BigNumber.from('18446744073709551616');
        expect(await fundProxy.mFeeRate64x64()).to.be.eq(_mFeeRate);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.mFeeRate64x64()).to.be.eq(_mFeeRate);
      });
      it('get the right performance fee rate', async function () {
        expect(await fundProxy.pFeeRate64x64()).to.be.eq(pFeeRate);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.pFeeRate64x64()).to.be.eq(pFeeRate);
      });
      it('get the right crystallization period', async function () {
        expect(await fundProxy.crystallizationPeriod()).to.be.eq(crystallizationPeriod);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.crystallizationPeriod()).to.be.eq(crystallizationPeriod);
      });
      it('get the reserve ratio', async function () {
        expect(await fundProxy.reserveExecutionRate()).to.be.eq(reserveExecutionRate);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.reserveExecutionRate()).to.be.eq(reserveExecutionRate);
      });
      it('get the vault address', async function () {
        const _vault = await fundProxy.vault();
        expect(_vault).to.be.not.eq(constants.AddressZero);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.vault()).to.be.eq(_vault);
      });
      it('get the right owner address', async function () {
        expect(await fundProxy.owner()).to.be.eq(manager.address);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.owner()).to.be.eq(manager.address);
      });
      it('get the mortgage vault address', async function () {
        expect(await fundProxy.mortgageVault()).to.be.eq(mortgageVault.address);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.mortgageVault()).to.be.eq(mortgageVault.address);
      });
    });
    describe('Setter', function () {
      // setter finalized getter
      it('set the right management fee rate', async function () {
        const _feeRate = BigNumber.from('1000');
        const _expectFeeRate = BigNumber.from('18446744135297203117');
        await fundProxy.connect(manager).setManagementFeeRate(_feeRate);
        expect(await fundProxy.mFeeRate64x64()).to.be.eq(_expectFeeRate);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.mFeeRate64x64()).to.be.eq(_expectFeeRate);
      });
      it('set the right performance fee rate', async function () {
        const _pFeeRate = BigNumber.from('1000');
        const expectedPFeeRate = BigNumber.from('1844674407370955161');
        await fundProxy.connect(manager).setPerformanceFeeRate(_pFeeRate);
        expect(await fundProxy.pFeeRate64x64()).to.be.eq(expectedPFeeRate);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.pFeeRate64x64()).to.be.eq(expectedPFeeRate);
      });
      it('set the right crystallization period', async function () {
        const _crystallizationPeriod = ONE_YEAR;
        await fundProxy.connect(manager).setCrystallizationPeriod(_crystallizationPeriod);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.crystallizationPeriod()).to.be.eq(_crystallizationPeriod);
      });
      it('set the right reserve ratio', async function () {
        const _reserveRatio = 100;
        await fundProxy.connect(manager).setReserveExecutionRate(_reserveRatio);
        await fundProxy.connect(manager).finalize();
        expect(await fundProxy.reserveExecutionRate()).to.be.eq(_reserveRatio);
      });
    });
  });
});
