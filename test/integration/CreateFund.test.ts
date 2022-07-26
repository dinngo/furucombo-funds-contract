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

import {
  ether,
  impersonateAndInjectEther,
  getEventArgs,
  getEffectiveMgmtFeeRate,
  expectEqWithinBps,
  get64x64FromNumber,
} from '../utils/utils';

import { createFundInfra } from './fund';
import { deployFurucomboProxyAndRegistry, createFundProxy } from './deploy';
import {
  FEE_BASE64x64,
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  FUND_STATE,
  ONE_DAY,
  FUND_PERCENTAGE_BASE,
  ONE_YEAR,
  BAT_PROVIDER,
} from '../utils/constants';

describe('CreateFund', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
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
  const mortgageAmount = ether('10');
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
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
    [owner, collector, manager, liquidator] = await (ethers as any).getSigners();

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
    [owner, collector, manager, liquidator] = await (ethers as any).getSigners();

    mortgageProvider = await impersonateAndInjectEther(mortgageProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
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

    fundProxy = await createFundProxy(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      shareTokenName
    );
  });

  describe('Create', function () {
    beforeEach(async function () {
      await setupCreateTest();
    });

    it('with valid params', async function () {
      // create fund
      const receipt = await fundProxyFactory
        .connect(manager)
        .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName);
      const eventArgs = await getEventArgs(receipt, 'FundCreated');
      const fundProxy = await ethers.getContractAt('FundImplementation', eventArgs.newFund);

      // verify states
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
      const invalidCreator = owner;
      await expect(
        fundProxyFactory
          .connect(invalidCreator)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(14)'); // FUND_PROXY_FACTORY_INVALID_CREATOR
    });

    it('should revert: invalid level', async function () {
      const level = 5;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(16)'); // FUND_PROXY_FACTORY_INVALID_MORTGAGE_TIER
    });

    it('should revert: invalid management fee rate', async function () {
      const mFeeRate = FUND_PERCENTAGE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(64)');
    });

    it('should revert: invalid performance fee rate', async function () {
      const pFeeRate = FUND_PERCENTAGE_BASE;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(67)');
    });

    it('should revert: invalid crystallization period', async function () {
      const crystallizationPeriod = 0;
      await expect(
        fundProxyFactory
          .connect(manager)
          .createFund(denominationAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName)
      ).to.be.revertedWith('RevertCode(68)');
    });

    it('should revert: invalid mortgage tier', async function () {
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
          shareTokenName
        )
      ).to.be.revertedWith('RevertCode(16)'); // FUND_PROXY_FACTORY_INVALID_MORTGAGE_TIER
    });
  });

  describe('Finalize', function () {
    beforeEach(async function () {
      await setupFinalizeTest();
    });

    describe('invalid mortgage amount', function () {
      it('should revert: manager mortgage balance < needed mortgage amount', async function () {
        // Approve mortgage
        await mortgage.connect(manager).approve(fundProxy.address, mortgageAmount);

        // Finalize furucombo fund
        await expect(fundProxy.connect(manager).finalize()).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance'
        );
      });

      it('should revert: manager approve mortgage < needed mortgage amount', async function () {
        // Transfer mortgage token to manager
        await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);

        // Approve not enough mortage token amount
        await mortgage.connect(manager).approve(mortgageVault.address, mortgageAmount.sub(1));
        await expect(fundProxy.connect(manager).finalize()).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance'
        );
      });
    });

    describe('valid mortgage amount', function () {
      beforeEach(async function () {
        // Transfer mortgage token to manager
        await mortgage.connect(mortgageProvider).transfer(manager.address, mortgageAmount);
        // Approve mortgage token to fundProxy
        await mortgage.connect(manager).approve(fundProxy.address, mortgageAmount);
      });

      it('deduct right mortgage amount', async function () {
        // Check before balance
        const mortgageBalanceBefore = await mortgage.balanceOf(manager.address);
        const mortgageVaultBalanceBefore = await mortgage.balanceOf(mortgageVault.address);

        // Finalize fund
        await fundProxy.connect(manager).finalize();

        // Verify after Balance
        const mortgageBalanceAfter = await mortgage.balanceOf(manager.address);
        const mortgageVaultBalanceAfter = await mortgage.balanceOf(mortgageVault.address);
        expect(mortgageBalanceBefore.sub(mortgageBalanceAfter)).to.be.eq(mortgageAmount);
        expect(mortgageVaultBalanceAfter.sub(mortgageVaultBalanceBefore)).to.be.eq(mortgageAmount);
      });

      it('should revert: invalid mortgage tier', async function () {
        await comptrollerProxy.unsetMortgageTier(level);
        await expect(fundProxy.connect(manager).finalize()).to.be.revertedWith('RevertCode(8)'); // IMPLEMENTATION_INVALID_MORTGAGE_TIER
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
          const _mFeeRate = FEE_BASE64x64;
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
          const _expectFeeRate = getEffectiveMgmtFeeRate(_feeRate.toNumber() / FUND_PERCENTAGE_BASE);

          await fundProxy.connect(manager).setManagementFeeRate(_feeRate);
          const _effectiveFeeRateBefore = await fundProxy.mFeeRate64x64();
          expectEqWithinBps(_effectiveFeeRateBefore, _expectFeeRate, 1, 15);

          await fundProxy.connect(manager).finalize();
          const _effectiveFeeRateAfter = await fundProxy.mFeeRate64x64();
          expectEqWithinBps(_effectiveFeeRateAfter, _expectFeeRate, 1, 15);
        });

        it('set the right performance fee rate', async function () {
          const _pFeeRate = BigNumber.from('1000');
          const _expectedPFeeRate = get64x64FromNumber(_pFeeRate.toNumber() / FUND_PERCENTAGE_BASE);

          await fundProxy.connect(manager).setPerformanceFeeRate(_pFeeRate);
          expect(await fundProxy.pFeeRate64x64()).to.be.eq(_expectedPFeeRate);
          await fundProxy.connect(manager).finalize();
          expect(await fundProxy.pFeeRate64x64()).to.be.eq(_expectedPFeeRate);
        });

        it('set the right crystallization period', async function () {
          const _crystallizationPeriod = ONE_YEAR;
          await fundProxy.connect(manager).setCrystallizationPeriod(_crystallizationPeriod);
          await fundProxy.connect(manager).finalize();
          expect(await fundProxy.crystallizationPeriod()).to.be.eq(_crystallizationPeriod);
        });
      });
    });
  });
});
