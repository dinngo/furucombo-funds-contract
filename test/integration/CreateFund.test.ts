import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';

import {
  Registry,
  FurucomboProxy,
  PoolImplementation,
  IERC20,
  PoolProxyFactory,
  MortgageVault,
  ComptrollerImplementation,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, getEventArgs } from '../utils/utils';

import { createFundInfra } from './fund';
import { deployFurucomboProxyAndRegistry, createPoolProxy } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  POOL_STATE,
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
  const stakeAmount = mwei('10');
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 5000; // 50%

  const shareTokenName = 'TEST';

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let poolProxyFactory: PoolProxyFactory;
  let mortgageVault: MortgageVault;
  let poolProxy: PoolImplementation;
  let comptrollerProxy: ComptrollerImplementation;

  let mortgage: IERC20;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      mortgageProvider = await impersonateAndInjectEther(
        mortgageProviderAddress
      );

      // Deploy furucombo
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
    }
  );
  beforeEach(async function () {
    await setupTest();
  });

  describe('Create', function () {
    beforeEach(async function () {
      [
        poolProxyFactory,
        ,
        ,
        ,
        ,
        ,
        ,
        mortgage,
        mortgageVault,
        ,
        comptrollerProxy,
      ] = await createFundInfra(
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
        stakeAmount,
        execFeePercentage,
        pendingExpiration,
        fRegistry,
        furucombo
      );
    });
    // create with normal params
    it('in reviewing state', async function () {
      const inititalMortgageBalance = await mortgage.balanceOf(manager.address);

      // Transfer mortgage token to manager
      await mortgage
        .connect(mortgageProvider)
        .transfer(manager.address, stakeAmount);
      await mortgage
        .connect(manager)
        .approve(mortgageVault.address, stakeAmount);

      // Create and finalize furucombo fund
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
      expect(await mortgage.balanceOf(manager.address)).to.be.eq(
        inititalMortgageBalance
      );
    });
    it('should revert: manager mortgage balance < stake amount', async function () {
      // approve mortgage
      await mortgage
        .connect(manager)
        .approve(mortgageVault.address, stakeAmount);
      // Create and finalize furucombo fund
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });
    it('should revert: manager approve mortgage < stake amount', async function () {
      // Transfer mortgage token to manager
      await mortgage
        .connect(mortgageProvider)
        .transfer(manager.address, stakeAmount);
      await mortgage
        .connect(manager)
        .approve(mortgageVault.address, stakeAmount.sub(1));

      // Create and finalize furucombo fund
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
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
      ).to.be.reverted;
    });
    it('should revert: invalid level', async function () {
      const level = 5;
      // Create and finalize furucombo fund
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid management fee rate', async function () {
      const mFeeRate = FEE_BASE;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid performance fee rate', async function () {
      const pFeeRate = FEE_BASE;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid crystallization period', async function () {
      const crystallizationPeriod = 0;
      await expect(
        poolProxyFactory
          .connect(manager)
          .createPool(
            denominationAddress,
            level,
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRatio,
            shareTokenName
          )
      ).to.be.reverted;
    });
    it('should revert: invalid reserve execution rate', async function () {
      const invalidReserveExecutionRate = FEE_BASE;
      await expect(
        createPoolProxy(
          poolProxyFactory,
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
      await comptrollerProxy.unsetStakedTier(level);
      await expect(
        createPoolProxy(
          poolProxyFactory,
          manager,
          denominationAddress,
          level,
          mFeeRate,
          pFeeRate,
          crystallizationPeriod,
          reserveExecutionRatio,
          shareTokenName
        )
      ).to.be.revertedWith('revertCode(75');
    });
  });
  describe('Finalize', function () {
    beforeEach(async function () {
      // Deploy furucombo funds contracts
      [poolProxyFactory, , , , , , , mortgage, mortgageVault] =
        await createFundInfra(
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
          stakeAmount,
          execFeePercentage,
          pendingExpiration,
          fRegistry,
          furucombo
        );

      // Transfer mortgage token to manager
      await mortgage
        .connect(mortgageProvider)
        .transfer(manager.address, stakeAmount);
      await mortgage
        .connect(manager)
        .approve(mortgageVault.address, stakeAmount);

      poolProxy = await createPoolProxy(
        poolProxyFactory,
        manager,
        denominationAddress,
        level,
        mFeeRate,
        pFeeRate,
        crystallizationPeriod,
        reserveExecutionRatio,
        shareTokenName
      );
    });
    describe('Getter', function () {
      // getter finalize getter
      it('get the right level value', async function () {
        expect(await poolProxy.level()).to.be.eq(level);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.level()).to.be.eq(level);
      });
      it('get the comptroller address', async function () {
        const _comptroller = await poolProxy.comptroller();
        expect(_comptroller).to.be.not.eq(constants.AddressZero);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.comptroller()).to.be.eq(_comptroller);
      });
      it('get the right denomination address', async function () {
        expect(await poolProxy.denomination()).to.be.eq(denominationAddress);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.denomination()).to.be.eq(denominationAddress);
      });
      it('get the share token address', async function () {
        const _shareToken = await poolProxy.shareToken();
        expect(_shareToken).to.be.not.eq(constants.AddressZero);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.shareToken()).to.be.eq(_shareToken);
      });
      it('get the right management fee rate', async function () {
        const _mFeeRate = BigNumber.from('18446744073709551616');
        expect(await poolProxy.getManagementFeeRate()).to.be.eq(_mFeeRate);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getManagementFeeRate()).to.be.eq(_mFeeRate);
      });
      it('get the right performance fee rate', async function () {
        expect(await poolProxy.getPerformanceFeeRate()).to.be.eq(pFeeRate);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getPerformanceFeeRate()).to.be.eq(pFeeRate);
      });
      it('get the right crystallization period', async function () {
        expect(await poolProxy.getCrystallizationPeriod()).to.be.eq(
          crystallizationPeriod
        );
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getCrystallizationPeriod()).to.be.eq(
          crystallizationPeriod
        );
      });
      it('get the reserve ratio', async function () {
        expect(await poolProxy.reserveExecutionRatio()).to.be.eq(
          reserveExecutionRatio
        );
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.reserveExecutionRatio()).to.be.eq(
          reserveExecutionRatio
        );
      });
      it('get the vault address', async function () {
        const _vault = await poolProxy.vault();
        expect(_vault).to.be.not.eq(constants.AddressZero);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.vault()).to.be.eq(_vault);
      });
      it('get the right owner address', async function () {
        expect(await poolProxy.owner()).to.be.eq(manager.address);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.owner()).to.be.eq(manager.address);
      });
      it('get the mortgage vault address', async function () {
        expect(await poolProxy.mortgageVault()).to.be.eq(mortgageVault.address);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.mortgageVault()).to.be.eq(mortgageVault.address);
      });
    });
    describe('Setter', function () {
      // setter finalized getter
      it('set the right management fee rate', async function () {
        const _feeRate = BigNumber.from('1000');
        const _expectFeeRate = BigNumber.from('18446744135297203117');
        await poolProxy.connect(manager).setManagementFeeRate(_feeRate);
        expect(await poolProxy.getManagementFeeRate()).to.be.eq(_expectFeeRate);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getManagementFeeRate()).to.be.eq(_expectFeeRate);
      });
      it('set the right performance fee rate', async function () {
        const _pFeeRate = BigNumber.from('1000');
        const expectedPFeeRate = BigNumber.from('1844674407370955161');
        await poolProxy.connect(manager).setPerformanceFeeRate(_pFeeRate);
        expect(await poolProxy.getPerformanceFeeRate()).to.be.eq(
          expectedPFeeRate
        );
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getPerformanceFeeRate()).to.be.eq(
          expectedPFeeRate
        );
      });
      it('set the right crystallization period', async function () {
        const _crystallizationPeriod = ONE_YEAR;
        await poolProxy
          .connect(manager)
          .setCrystallizationPeriod(_crystallizationPeriod);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.getCrystallizationPeriod()).to.be.eq(
          _crystallizationPeriod
        );
      });
      it('set the right reserve ratio', async function () {
        const _reserveRatio = 100;
        await poolProxy
          .connect(manager)
          .setReserveExecutionRatio(_reserveRatio);
        await poolProxy.connect(manager).finalize();
        expect(await poolProxy.reserveExecutionRatio()).to.be.eq(_reserveRatio);
      });
    });
  });
});
