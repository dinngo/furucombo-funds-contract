import { ethers, deployments, network } from 'hardhat';
import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { expect } from 'chai';
import {
  ComptrollerImplementation,
  PoolImplementationMock,
  IDSProxy,
  Chainlink,
  ERC20,
  AssetRouter,
  MortgageVault,
  PoolFooAction,
  PoolFoo,
  TaskExecutor,
  SimpleToken,
  SimpleAction,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  USDC_TOKEN,
  WETH_TOKEN,
  WBTC_TOKEN,
  BAT_TOKEN,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  CHAINLINK_WBTC_USD,
  FEE_BASE,
  WL_ANY_SIG,
  FEE_BASE64x64,
  TOLERANCE_BASE,
  POOL_STATE,
} from './utils/constants';

import {
  simpleEncode,
  tokenProviderQuick,
  mwei,
  getCallData,
  increaseNextBlockTimeBy,
} from './utils/utils';

describe('PoolImplementation', function () {
  const denominationAddress = USDC_TOKEN;
  const denominationAggregator = CHAINLINK_USDC_USD;
  const denominationDust = mwei('0.1');
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = WBTC_TOKEN;
  const tokenCAddress = BAT_TOKEN;
  const aggregatorA = CHAINLINK_ETH_USD;
  const aggregatorB = CHAINLINK_WBTC_USD;
  const tokenAAmount = ethers.utils.parseEther('1');
  const tokenBAmount = ethers.utils.parseUnits('1', 8);
  const execFeePercentage = 200; // 20%
  const managementFeeRate = 0; // 0%
  const performanceFeeRate = 1000; // 10%
  const pendingExpiration = 43200; // 0.5 day
  const valueTolerance = 9000; // 90%
  const CRYSTALLIZATION_PERIOD_MIN = 1; // 1 sec
  const crystallizationPeriod = CRYSTALLIZATION_PERIOD_MIN;
  const level = 1;
  const reserveExecution = 0;
  const reserveBase = FEE_BASE;

  let comptroller: ComptrollerImplementation;
  let action: SimpleAction;
  let poolImplementation: PoolImplementationMock;
  let taskExecutor: TaskExecutor;
  let vault: IDSProxy;
  let oracle: Chainlink;

  let owner: Wallet;
  let user: Wallet;
  let liquidator: Wallet;

  let denomination: ERC20;
  let denominationProvider: Signer;
  let tokenA: ERC20;
  let tokenAProvider: Signer;
  let tokenB: ERC20;
  let tokenBProvider: Signer;
  let tokenC: ERC20;
  let tokenCProvider: Signer;
  let shareToken: SimpleToken;

  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let fooAction: PoolFooAction;
  let foo: PoolFoo;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [owner, user, liquidator] = await (ethers as any).getSigners();

      denomination = await ethers.getContractAt('ERC20', denominationAddress);
      denominationProvider = await tokenProviderQuick(denomination.address);
      tokenA = await ethers.getContractAt('ERC20', tokenAAddress);
      tokenAProvider = await tokenProviderQuick(tokenA.address);
      tokenB = await ethers.getContractAt('ERC20', tokenBAddress);
      tokenBProvider = await tokenProviderQuick(tokenB.address);
      tokenC = await ethers.getContractAt('ERC20', tokenCAddress);
      tokenCProvider = await tokenProviderQuick(tokenC.address);

      poolImplementation = await (
        await ethers.getContractFactory('PoolImplementationMock')
      ).deploy(DS_PROXY_REGISTRY);

      const canonicalResolver = await (
        await ethers.getContractFactory('RCanonical')
      ).deploy();

      const debtAssetResolver = await (
        await ethers.getContractFactory('AssetResolverMockB')
      ).deploy();

      const assetRegistry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await assetRegistry.register(
        denomination.address,
        canonicalResolver.address
      );
      await assetRegistry.register(tokenA.address, canonicalResolver.address);
      await assetRegistry.register(tokenB.address, canonicalResolver.address);
      await assetRegistry.register(tokenC.address, debtAssetResolver.address);

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.addAssets(
        [denomination.address, tokenA.address, tokenB.address],
        [denominationAggregator, aggregatorA, aggregatorB]
      );

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, assetRegistry.address);

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(tokenA.address);
      await mortgageVault.deployed();

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).deploy();
      await comptroller.deployed();
      await comptroller.initialize(
        poolImplementation.address,
        assetRouter.address,
        owner.address,
        execFeePercentage,
        liquidator.address,
        pendingExpiration,
        mortgageVault.address,
        valueTolerance
      );

      action = await (await ethers.getContractFactory('SimpleAction')).deploy();
      await action.deployed();

      // Initialization
      await comptroller.permitDenominations(
        [denomination.address],
        [denominationDust]
      );
      await comptroller.permitAssets(level, [denomination.address]);

      shareToken = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await shareToken.deployed();

      await poolImplementation
        .connect(owner)
        .initialize(
          level,
          comptroller.address,
          denomination.address,
          shareToken.address,
          managementFeeRate,
          performanceFeeRate,
          crystallizationPeriod,
          reserveExecution,
          owner.address
        );

      vault = await ethers.getContractAt(
        'IDSProxy',
        await poolImplementation.vault()
      );

      taskExecutor = await (
        await ethers.getContractFactory('TaskExecutor')
      ).deploy(owner.address, comptroller.address);
      await taskExecutor.deployed();
      await comptroller.setExecAction(taskExecutor.address);

      fooAction = await (
        await ethers.getContractFactory('PoolFooAction')
      ).deploy();
      await fooAction.deployed();

      foo = await (await ethers.getContractFactory('PoolFoo')).deploy();
      await foo.deployed();
    }
  );

  async function transferAssetToVault() {
    await poolImplementation.finalize();

    // Transfer asset to vault
    const expectedA = await oracle.calcConversionAmount(
      tokenA.address,
      tokenAAmount,
      denomination.address
    );
    const expectedB = await oracle.calcConversionAmount(
      tokenB.address,
      tokenBAmount,
      denomination.address
    );

    // Permit asset
    await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

    // Transfer assets to vault
    await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);
    await tokenB.connect(tokenBProvider).transfer(vault.address, tokenBAmount);

    // Add assets to tracking list
    await poolImplementation.addAsset(tokenA.address);
    await poolImplementation.addAsset(tokenB.address);

    const value = await poolImplementation.getTotalAssetValue();
    expect(value).to.be.eq(expectedA.add(expectedB));

    // Transfer 10% of total asset value, this makes currentReserve percentage close to 1/11.
    const denominationReserve = value.div(10);
    await denomination
      .connect(denominationProvider)
      .transfer(vault.address, denominationReserve);

    const totalAssetValue = await poolImplementation.getTotalAssetValue();
    const currentReserve = denominationReserve
      .mul(reserveBase)
      .div(totalAssetValue);

    return currentReserve;
  }

  beforeEach(async function () {
    await setupTest();
  });

  describe('State changes', function () {
    describe('Initialize', function () {
      it('should set level', async function () {
        const _level = await poolImplementation.level();
        expect(_level).to.be.gt(0);
        expect(_level).to.be.eq(level);
      });
      it('should set comptroller', async function () {
        const comptrollerAddr = await poolImplementation.comptroller();
        expect(comptrollerAddr).to.be.not.eq(constants.AddressZero);
        expect(comptrollerAddr).to.be.eq(comptroller.address);
      });
      it('should set denomination', async function () {
        const denominationAddr = await poolImplementation.denomination();
        expect(denominationAddr).to.be.not.eq(constants.AddressZero);
        expect(denominationAddr).to.be.eq(denomination.address);
      });
      it('should set share token', async function () {
        const shareTokenAddr = await poolImplementation.shareToken();
        expect(shareTokenAddr).to.be.not.eq(constants.AddressZero);
        expect(shareTokenAddr).to.be.eq(shareToken.address);
      });
      it('should set management fee rate', async function () {
        const feeRate = await poolImplementation.getManagementFeeRate();
        expect(feeRate).to.be.eq(BigNumber.from(FEE_BASE64x64));
      });
      it('should set performance fee rate', async function () {
        const feeRate = await poolImplementation.getPerformanceFeeRate();
        expect(feeRate).to.be.eq(BigNumber.from('1844674407370955161'));
      });
      it('should set crystallization period', async function () {
        const _crystallizationPeriod =
          await poolImplementation.getCrystallizationPeriod();
        expect(_crystallizationPeriod).to.be.gte(CRYSTALLIZATION_PERIOD_MIN);
        expect(_crystallizationPeriod).to.be.eq(crystallizationPeriod);
      });
      it('should set vault', async function () {
        expect(await poolImplementation.vault()).to.be.not.eq(
          constants.AddressZero
        );
      });
      it('should set owner', async function () {
        const _owner = await poolImplementation.owner();
        expect(_owner).to.be.not.eq(constants.AddressZero);
        expect(_owner).to.be.eq(owner.address);
      });
      it('should set mortgage vault', async function () {
        const mortgageVault = await comptroller.mortgageVault();
        const _mortgageVault = await poolImplementation.mortgageVault();
        expect(_mortgageVault).to.be.not.eq(constants.AddressZero);
        expect(_mortgageVault).to.be.eq(mortgageVault);
      });
      it('should revert: twice initialization', async function () {
        await expect(
          poolImplementation
            .connect(owner)
            .initialize(
              0,
              constants.AddressZero,
              constants.AddressZero,
              constants.AddressZero,
              0,
              0,
              0,
              0,
              constants.AddressZero
            )
        ).to.be.revertedWith('InvalidState(1)');
      });
    });

    describe('Finalize', function () {
      it('should success', async function () {
        const receipt = await poolImplementation.finalize();
        const block = await ethers.provider.getBlock(receipt.blockNumber!);
        const timestamp = BigNumber.from(block.timestamp);

        // check add denomication to list
        expect(await poolImplementation.getAssetList()).to.be.deep.eq([
          denomination.address,
        ]);

        // check management fee initilize
        const lastMFeeClaimTime =
          await poolImplementation.callStatic.lastMFeeClaimTime();
        expect(lastMFeeClaimTime).to.be.eq(timestamp);

        // check performance fee initilize
        const lastGrossSharePrice =
          await poolImplementation.callStatic.lastGrossSharePrice64x64();
        const hwm64x64 = await poolImplementation.callStatic.hwm64x64();
        expect(lastGrossSharePrice).to.be.eq(BigNumber.from(FEE_BASE64x64));
        expect(lastGrossSharePrice).to.be.eq(hwm64x64);

        // check vault approval
        const allowance = await denomination.allowance(
          vault.address,
          poolImplementation.address
        );
        expect(allowance).to.be.eq(constants.MaxUint256);
      });

      it('should revert: finalize by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).finalize()
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: finalize after denomination is forbidden', async function () {
        await comptroller.forbidDenominations([denomination.address]);
        await expect(poolImplementation.finalize()).to.be.revertedWith(
          'revertCode(12)' // IMPLEMENTATION_INVALID_DENOMINATION
        );
      });
    });

    it('resume', async function () {
      await poolImplementation.finalize();
      await poolImplementation.pendMock();
      await expect(poolImplementation.resume())
        .to.emit(poolImplementation, 'StateTransited')
        .withArgs(POOL_STATE.EXECUTING);
      expect(await poolImplementation.getAssetList()).to.be.deep.eq([
        denomination.address,
      ]);
      expect(await poolImplementation.pendingStartTime()).to.be.eq(0);
    });

    describe('Liquidate', function () {
      it('liquidate', async function () {
        await poolImplementation.finalize();
        await poolImplementation.pendMock();
        await network.provider.send('evm_increaseTime', [pendingExpiration]);
        await expect(poolImplementation.liquidate())
          .to.emit(poolImplementation, 'StateTransited')
          .withArgs(POOL_STATE.LIQUIDATING)
          .to.emit(poolImplementation, 'OwnershipTransferred')
          .withArgs(owner.address, liquidator.address);
        expect(await poolImplementation.pendingStartTime()).to.be.eq(0);
      });

      it('liquidate by user', async function () {
        await poolImplementation.finalize();
        await poolImplementation.pendMock();
        await network.provider.send('evm_increaseTime', [pendingExpiration]);
        await expect(poolImplementation.connect(user).liquidate())
          .to.emit(poolImplementation, 'StateTransited')
          .withArgs(POOL_STATE.LIQUIDATING)
          .to.emit(poolImplementation, 'OwnershipTransferred')
          .withArgs(owner.address, liquidator.address);
      });

      it('should revert: pending does not start', async function () {
        await poolImplementation.finalize();
        await expect(poolImplementation.liquidate()).to.be.revertedWith(
          'revertCode(8)' // IMPLEMENTATION_PENDING_NOT_START
        );
      });

      it('should revert: pending does not expire', async function () {
        await poolImplementation.finalize();
        await poolImplementation.pendMock();
        await expect(poolImplementation.liquidate()).to.be.revertedWith(
          'revertCode(9)' // IMPLEMENTATION_PENDING_NOT_EXPIRE
        );
      });
    });

    describe('Close', function () {
      it('close when executing', async function () {
        await poolImplementation.finalize();
        await expect(poolImplementation.close())
          .to.emit(poolImplementation, 'StateTransited')
          .withArgs(POOL_STATE.CLOSED);
      });

      it('should revert: close by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).close()
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('Asset module', function () {
    beforeEach(async function () {
      await poolImplementation.finalize();
    });

    describe('add asset', function () {
      it('should succeed when amount > dust', async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

        // Transfer asset to vault
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, tokenAAmount);

        // Add asset
        await poolImplementation.addAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.be.deep.eq([
          denomination.address,
          tokenA.address,
        ]);
      });

      it('should succeed when amount = dust ', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust.add(mwei('0.000001')),
          tokenA.address
        );

        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, dustAmount);

        expect(await poolImplementation.getAssetValue(tokenA.address)).to.be.eq(
          denominationDust
        );

        await poolImplementation.addAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.be.deep.eq([
          denomination.address,
          tokenA.address,
        ]);
      });

      it('add debt asset ', async function () {
        await comptroller.permitAssets(level, [tokenC.address]);
        await tokenC
          .connect(tokenCProvider)
          .transfer(vault.address, BigNumber.from('1'));
        await poolImplementation.addAsset(tokenC.address);
        expect(await poolImplementation.getAssetList()).to.deep.include(
          tokenC.address
        );
      });

      it('should revert: add by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).addAsset(tokenA.address)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: asset is not permitted', async function () {
        await expect(
          poolImplementation.addAsset(tokenA.address)
        ).to.be.revertedWith('revertCode(11)'); // IMPLEMENTATION_INVALID_ASSET
      });

      it('can not be added: zero balance of asset', async function () {
        await comptroller.permitAssets(level, [tokenA.address]);
        await poolImplementation.addAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });

      it('can not be added: balance of asset < dust ', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust.sub(BigNumber.from('10')),
          tokenA.address
        );

        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, dustAmount);

        await poolImplementation.addAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });
    });

    describe('remove asset', function () {
      beforeEach(async function () {
        // Permit asset
        await comptroller.permitAssets(level, [
          tokenA.address,
          tokenC.address,
          denomination.address,
        ]);

        // Transfer asset to vault
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, tokenAAmount);
        await tokenC
          .connect(tokenCProvider)
          .transfer(vault.address, tokenAAmount);

        await denomination
          .connect(denominationProvider)
          .transfer(vault.address, denominationDust.mul(2));

        // Add asset
        await poolImplementation.addAsset(tokenA.address);
        await poolImplementation.addAsset(tokenC.address);
        await poolImplementation.addAsset(denomination.address);
      });

      it('normal', async function () {
        // Drain vault by sending token back to owner
        const amount = await tokenA.balanceOf(vault.address);
        const data = simpleEncode('transfer(address,uint256)', [
          owner.address,
          amount,
        ]);
        await poolImplementation.vaultCallMock(tokenA.address, data);
        await poolImplementation.removeAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });

      it('dust balance of asset', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust,
          tokenA.address
        );

        // Drain vault by sending token back to owner
        const data = simpleEncode('transfer(address,uint256)', [
          owner.address,
          tokenAAmount.sub(dustAmount.div(2)),
        ]);
        await poolImplementation.vaultCallMock(tokenA.address, data);
        await poolImplementation.removeAsset(tokenA.address);

        expect(await poolImplementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });

      it('should revert: remove by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).removeAsset(tokenA.address)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('can not be removed: balance of asset > dust ', async function () {
        await poolImplementation.removeAsset(tokenA.address);
        expect(await poolImplementation.getAssetList()).to.deep.include(
          tokenA.address
        );
      });

      it('can not be removed: denomination', async function () {
        await poolImplementation.removeAsset(denomination.address);
        expect(await poolImplementation.getAssetList()).to.deep.include(
          denomination.address
        );
      });

      it('can not be removed: debt < zero', async function () {
        await poolImplementation.removeAsset(tokenC.address);
        expect(await poolImplementation.getAssetList()).to.deep.include(
          tokenC.address
        );
      });
    });
  });

  describe('Execute module', function () {
    const valueBefore = ethers.utils.parseEther('1');
    let actionData, executionData: any;
    beforeEach(async function () {
      await poolImplementation.finalize();
      await poolImplementation.setLastTotalAssetValue(valueBefore);
      actionData = getCallData(action, 'fooAddress', []);
      executionData = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [action.address],
        [constants.HashZero],
        [actionData],
      ]);
      await comptroller.permitDelegateCalls(
        await poolImplementation.level(),
        [action.address],
        [WL_ANY_SIG]
      );
    });

    it('should success', async function () {
      const valueCurrent = valueBefore.mul(valueTolerance).div(TOLERANCE_BASE);
      await poolImplementation.setTotalAssetValueMock(valueCurrent);
      await poolImplementation.execute(executionData);
    });

    it('should revert when exceed tolerance', async function () {
      const valueCurrent = valueBefore
        .mul(valueTolerance - 1)
        .div(TOLERANCE_BASE);
      await poolImplementation.setTotalAssetValueMock(valueCurrent);
      await expect(
        poolImplementation.execute(executionData)
      ).to.be.revertedWith(
        'revertCode(73)' // IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
      );
    });
  });

  describe('Setters', function () {
    describe('Management Fee Rate', function () {
      const feeRate = BigNumber.from('1000');

      it('set management fee rate', async function () {
        await poolImplementation.setManagementFeeRate(feeRate);
        expect(await poolImplementation.getManagementFeeRate()).to.be.eq(
          BigNumber.from('18446744135297203117')
        );
      });

      it('should revert: set management fee rate at wrong stage', async function () {
        await poolImplementation.finalize();
        await expect(
          poolImplementation.setManagementFeeRate(feeRate)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).setManagementFeeRate(feeRate)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by max value', async function () {
        const maxRate = 1e4;
        await expect(
          poolImplementation.setManagementFeeRate(maxRate)
        ).to.be.revertedWith('revertCode(69)'); // MANAGEMENT_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE
      });
    });

    describe('Performance Fee Rate', function () {
      const feeRate = 0;

      it('set performance fee rate', async function () {
        await poolImplementation.setPerformanceFeeRate(feeRate);
        expect(await poolImplementation.getPerformanceFeeRate()).to.be.eq(0);
      });

      it('should revert: set performance fee rate at wrong stage', async function () {
        await poolImplementation.finalize();
        await expect(
          poolImplementation.setPerformanceFeeRate(feeRate)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).setPerformanceFeeRate(feeRate)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by max value', async function () {
        const maxRate = 1e4;
        await expect(
          poolImplementation.setPerformanceFeeRate(maxRate)
        ).to.be.revertedWith('revertCode(65)'); // PERFORMANCE_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE
      });
    });

    describe('Crystallization Period', function () {
      const period = CRYSTALLIZATION_PERIOD_MIN + 1000;

      it('set crystallization period', async function () {
        await poolImplementation.setCrystallizationPeriod(period);
        expect(await poolImplementation.getCrystallizationPeriod()).to.be.eq(
          period
        );
      });

      it('should revert: set crystallization period at wrong stage', async function () {
        await poolImplementation.finalize();
        await expect(
          poolImplementation.setCrystallizationPeriod(period)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          poolImplementation.connect(user).setCrystallizationPeriod(period)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by too short period', async function () {
        const shortPeriod = CRYSTALLIZATION_PERIOD_MIN - 1;
        await expect(
          poolImplementation.setCrystallizationPeriod(shortPeriod)
        ).to.be.revertedWith('revertCode(66)'); // PERFORMANCE_FEE_MODULE_CRYSTALLIZATION_PERIOD_TOO_SHORT
      });
    });

    describe('Reserve Execution', function () {
      it('set reserve execution', async function () {
        await poolImplementation.setReserveExecutionRatio(100);
        expect(await poolImplementation.reserveExecutionRatio()).to.be.eq(100);
      });

      it('should revert: set reserve execution at wrong stage', async function () {
        await poolImplementation.finalize();
        await expect(
          poolImplementation.setReserveExecutionRatio(denominationDust)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          poolImplementation
            .connect(user)
            .setReserveExecutionRatio(denominationDust)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: invalid reserve execution', async function () {
        await expect(
          poolImplementation.setReserveExecutionRatio(reserveBase)
        ).to.be.revertedWith('revertCode(75)');
      });
    });
  });

  describe('Getters', function () {
    beforeEach(async function () {
      await poolImplementation.finalize();
    });

    it('get asset total value', async function () {
      // Get expected amount
      const expectedA = await oracle.calcConversionAmount(
        tokenA.address,
        tokenAAmount,
        denomination.address
      );
      const expectedB = await oracle.calcConversionAmount(
        tokenB.address,
        tokenBAmount,
        denomination.address
      );

      // Permit asset
      await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

      // Transfer assets to vault
      await tokenA
        .connect(tokenAProvider)
        .transfer(vault.address, tokenAAmount);
      await tokenB
        .connect(tokenBProvider)
        .transfer(vault.address, tokenBAmount);

      // Add assets to tracking list
      await poolImplementation.addAsset(tokenA.address);
      await poolImplementation.addAsset(tokenB.address);

      const value = await poolImplementation.getTotalAssetValue();
      expect(value).to.be.eq(expectedA.add(expectedB));
    });

    it('zero total value', async function () {
      expect(await poolImplementation.getTotalAssetValue()).to.be.eq(0);
    });
  });

  describe('Reserve', function () {
    let currentReserveRatio = constants.Zero;

    beforeEach(async function () {
      currentReserveRatio = await transferAssetToVault();
      poolImplementation.reviewingMock();
    });

    it('reserve is totally enough', async function () {
      await poolImplementation.setReserveExecutionRatio(100); // 1%
      expect(await poolImplementation.isReserveEnough()).to.be.eq(true);
    });

    it('reserve is a little bit more than setting', async function () {
      await poolImplementation.setReserveExecutionRatio(
        currentReserveRatio.sub(5)
      ); // reserveExecution is 0.05% below currentReserve
      expect(await poolImplementation.isReserveEnough()).to.be.eq(true);
    });

    it('reserve is totally not enough', async function () {
      await poolImplementation.setReserveExecutionRatio(1500); // 15%
      expect(await poolImplementation.isReserveEnough()).to.be.eq(false);
    });

    it('reserve is a little bit less than setting', async function () {
      await poolImplementation.setReserveExecutionRatio(
        currentReserveRatio.add(5)
      ); // reserveExecution is 0.05% above currentReserve
      expect(await poolImplementation.isReserveEnough()).to.be.eq(false);
    });
  });

  describe('Settle pending', function () {
    beforeEach(async function () {
      await poolImplementation.finalize();
      const currentReserve = await poolImplementation.getReserve();

      const redeemAmount = currentReserve.add(mwei('500'));
      await denomination
        .connect(denominationProvider)
        .transfer(owner.address, redeemAmount.mul(2)); // Transfer more to owner

      // Make a purchase, let fund update some data. (ex: lastMFeeClaimTime)
      await poolImplementation.setTotalAssetValueMock(mwei('5000'));
      await denomination
        .connect(owner)
        .approve(poolImplementation.address, 500);
      await poolImplementation.purchase(500);

      // Make fund go to RedemptionPending state
      const redeemShare = await poolImplementation.calculateShare(redeemAmount);
      await shareToken.transfer(owner.address, redeemShare);
      await poolImplementation.redeem(redeemShare, true);

      expect(await poolImplementation.state()).to.be.eq(
        POOL_STATE.REDEMPTION_PENDING
      );

      // Transfer some money to vault, so that able to resolve pending redemption
      await denomination
        .connect(denominationProvider)
        .transfer(vault.address, redeemAmount.mul(2));
    });

    it('resolve RedemptionPending state after execute', async function () {
      // Prepare task data and execute
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint1', [
        foo.address,
        expectNValue,
      ]);

      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      // Permit delegate calls
      await comptroller.permitDelegateCalls(
        await poolImplementation.level(),
        [fooAction.address],
        [WL_ANY_SIG]
      );
      await expect(await poolImplementation.execute(data))
        .to.emit(poolImplementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
      expect(await poolImplementation.state()).to.be.eq(POOL_STATE.EXECUTING);
    });

    it('resolve RedemptionPending state after purchase', async function () {
      // Prepare task data and execute
      const purchaseAmount = mwei('1');
      await denomination
        .connect(owner)
        .approve(poolImplementation.address, purchaseAmount);

      await expect(poolImplementation.purchase(purchaseAmount))
        .to.emit(poolImplementation, 'Redeemed')
        .to.emit(poolImplementation, 'Purchased');
      expect(await poolImplementation.state()).to.be.eq(POOL_STATE.EXECUTING);
    });

    it('settle pending when close', async function () {
      // Go to liquidating state
      await increaseNextBlockTimeBy(pendingExpiration);
      await expect(poolImplementation.liquidate())
        .to.emit(poolImplementation, 'StateTransited')
        .withArgs(4)
        .to.emit(poolImplementation, 'OwnershipTransferred')
        .withArgs(owner.address, liquidator.address);

      // Close
      await expect(await poolImplementation.connect(liquidator).close())
        .to.emit(poolImplementation, 'StateTransited')
        .withArgs(POOL_STATE.CLOSED)
        .to.emit(poolImplementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
    });
  });
});
