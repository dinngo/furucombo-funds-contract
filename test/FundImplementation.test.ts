import { ethers, deployments, network } from 'hardhat';
import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { expect } from 'chai';
import {
  ComptrollerImplementation,
  FundImplementationMock,
  IDSProxy,
  Chainlink,
  ERC20,
  AssetRouter,
  MortgageVault,
  FundFooAction,
  FundFoo,
  TaskExecutor,
  ShareToken,
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
  WL_ANY_SIG,
  FUND_PERCENTAGE_BASE,
  FUND_STATE,
} from './utils/constants';

import {
  simpleEncode,
  tokenProviderQuick,
  mwei,
  get64x64FromNumber,
  getCallData,
  increaseNextBlockTimeBy,
  ether,
} from './utils/utils';

describe('FundImplementation', function () {
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
  const reserveBase = FUND_PERCENTAGE_BASE;

  let comptroller: ComptrollerImplementation;
  let action: SimpleAction;
  let fundImplementation: FundImplementationMock;
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
  let shareToken: ShareToken;

  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let fooAction: FundFooAction;
  let foo: FundFoo;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [owner, user, liquidator] = await (ethers as any).getSigners();

    denomination = await ethers.getContractAt('ERC20', denominationAddress);
    denominationProvider = await tokenProviderQuick(denomination.address);
    tokenA = await ethers.getContractAt('ERC20', tokenAAddress);
    tokenAProvider = await tokenProviderQuick(tokenA.address);
    tokenB = await ethers.getContractAt('ERC20', tokenBAddress);
    tokenBProvider = await tokenProviderQuick(tokenB.address);
    tokenC = await ethers.getContractAt('ERC20', tokenCAddress);
    tokenCProvider = await tokenProviderQuick(tokenC.address);

    fundImplementation = await (await ethers.getContractFactory('FundImplementationMock')).deploy();

    const canonicalResolver = await (await ethers.getContractFactory('RCanonical')).deploy();

    const debtAssetResolver = await (await ethers.getContractFactory('AssetResolverMockB')).deploy();

    const assetRegistry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await assetRegistry.register(denomination.address, canonicalResolver.address);
    await assetRegistry.register(tokenA.address, canonicalResolver.address);
    await assetRegistry.register(tokenB.address, canonicalResolver.address);
    await assetRegistry.register(tokenC.address, debtAssetResolver.address);

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.addAssets(
      [denomination.address, tokenA.address, tokenB.address],
      [denominationAggregator, aggregatorA, aggregatorB]
    );

    assetRouter = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, assetRegistry.address);

    mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(tokenA.address);
    await mortgageVault.deployed();

    const setupAction = await (await ethers.getContractFactory('SetupAction')).deploy();
    await setupAction.deployed();

    comptroller = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
    await comptroller.deployed();
    await comptroller.initialize(
      fundImplementation.address,
      assetRouter.address,
      owner.address,
      execFeePercentage,
      liquidator.address,
      pendingExpiration,
      mortgageVault.address,
      valueTolerance,
      DS_PROXY_REGISTRY,
      setupAction.address
    );

    action = await (await ethers.getContractFactory('SimpleAction')).deploy();
    await action.deployed();

    // Initialization
    await comptroller.permitDenominations([denomination.address], [denominationDust]);
    await comptroller.permitAssets(level, [denomination.address]);
    await comptroller.setMortgageTier(level, 0);

    shareToken = await (await ethers.getContractFactory('ShareToken')).connect(user).deploy('Test', 'TST', 18);
    await shareToken.deployed();
    await shareToken.transferOwnership(fundImplementation.address);

    await fundImplementation
      .connect(owner)
      .initialize(
        level,
        comptroller.address,
        denomination.address,
        shareToken.address,
        managementFeeRate,
        performanceFeeRate,
        crystallizationPeriod,
        owner.address
      );

    vault = await ethers.getContractAt('IDSProxy', await fundImplementation.vault());

    taskExecutor = await (await ethers.getContractFactory('TaskExecutor')).deploy(owner.address, comptroller.address);
    await taskExecutor.deployed();
    await comptroller.setExecAction(taskExecutor.address);

    fooAction = await (await ethers.getContractFactory('FundFooAction')).deploy();
    await fooAction.deployed();

    foo = await (await ethers.getContractFactory('FundFoo')).deploy();
    await foo.deployed();
  });

  beforeEach(async function () {
    await setupTest();
    const nts = await shareToken.netTotalShare();
  });

  describe('Implementation', function () {
    it('implementation owner should be address(0)', async function () {
      const implementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
      expect(await implementation.owner()).to.be.equal(constants.AddressZero);
    });
  });

  describe('State changes', function () {
    describe('Initialize', function () {
      it('set level', async function () {
        const _level = await fundImplementation.level();
        expect(_level).to.be.gt(0);
        expect(_level).to.be.eq(level);
      });

      it('set comptroller', async function () {
        const comptrollerAddr = await fundImplementation.comptroller();
        expect(comptrollerAddr).to.be.not.eq(constants.AddressZero);
        expect(comptrollerAddr).to.be.eq(comptroller.address);
      });

      it('set denomination', async function () {
        const denominationAddr = await fundImplementation.denomination();
        expect(denominationAddr).to.be.not.eq(constants.AddressZero);
        expect(denominationAddr).to.be.eq(denomination.address);
      });

      it('set share token', async function () {
        const shareTokenAddr = await fundImplementation.shareToken();
        expect(shareTokenAddr).to.be.not.eq(constants.AddressZero);
        expect(shareTokenAddr).to.be.eq(shareToken.address);
      });

      it('set management fee rate', async function () {
        const rate = get64x64FromNumber(1);
        const feeRate = await fundImplementation.mFeeRate64x64();
        expect(feeRate).to.be.eq(rate);
      });

      it('set performance fee rate', async function () {
        const rate = get64x64FromNumber(performanceFeeRate / FUND_PERCENTAGE_BASE);
        const feeRate = await fundImplementation.pFeeRate64x64();
        expect(feeRate).to.be.eq(rate);
      });

      it('set crystallization period', async function () {
        const crystallizationPeriod = await fundImplementation.crystallizationPeriod();
        expect(crystallizationPeriod).to.be.gte(CRYSTALLIZATION_PERIOD_MIN);
        expect(crystallizationPeriod).to.be.eq(crystallizationPeriod);
      });

      it('set vault', async function () {
        expect(await fundImplementation.vault()).to.be.not.eq(constants.AddressZero);
      });

      it('set owner', async function () {
        const _owner = await fundImplementation.owner();
        expect(_owner).to.be.not.eq(constants.AddressZero);
        expect(_owner).to.be.eq(owner.address);
      });

      it('set mortgage vault', async function () {
        const mortgageVault = await comptroller.mortgageVault();
        const _mortgageVault = await fundImplementation.mortgageVault();
        expect(_mortgageVault).to.be.not.eq(constants.AddressZero);
        expect(_mortgageVault).to.be.eq(mortgageVault);
      });

      it('should revert: twice initialization', async function () {
        await expect(
          fundImplementation
            .connect(owner)
            .initialize(
              0,
              constants.AddressZero,
              constants.AddressZero,
              constants.AddressZero,
              0,
              0,
              0,
              constants.AddressZero
            )
        ).to.be.revertedWith('InvalidState(1)');
      });
    });

    describe('Finalize', function () {
      it('success', async function () {
        // setup mortgage
        const mortgageAmount = ether('1');
        await comptroller.setMortgageTier(level, mortgageAmount);
        await tokenA.connect(tokenAProvider).transfer(owner.address, mortgageAmount);
        await tokenA.approve(fundImplementation.address, mortgageAmount);

        // finalize
        const receipt = await fundImplementation.finalize();
        const block = await ethers.provider.getBlock(receipt.blockNumber!);
        const timestamp = BigNumber.from(block.timestamp);
        const price = get64x64FromNumber(1);

        // check add denomication to list
        expect(await fundImplementation.getAssetList()).to.be.deep.eq([denomination.address]);

        // check management fee initilize
        const lastMFeeClaimTime = await fundImplementation.lastMFeeClaimTime();
        expect(lastMFeeClaimTime).to.be.eq(timestamp);

        // check performance fee initilize
        const lastGrossSharePrice = await fundImplementation.lastGrossSharePrice64x64();
        const hwm64x64 = await fundImplementation.hwm64x64();
        expect(lastGrossSharePrice).to.be.eq(BigNumber.from(price));
        expect(lastGrossSharePrice).to.be.eq(hwm64x64);

        // check vault approval
        const allowance = await denomination.allowance(vault.address, fundImplementation.address);
        expect(allowance).to.be.eq(constants.MaxUint256);

        // check mortgage amount
        const mortgageFund = await mortgageVault.fundAmounts(fundImplementation.address);
        expect(mortgageFund).to.be.eq(mortgageAmount);
      });

      it('should revert: finalize by non-owner', async function () {
        await expect(fundImplementation.connect(user).finalize()).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('should revert: finalize after denomination is forbidden', async function () {
        await comptroller.forbidDenominations([denomination.address]);
        await expect(fundImplementation.finalize()).to.be.revertedWith(
          'RevertCode(7)' // IMPLEMENTATION_INVALID_DENOMINATION
        );
      });

      it('should revert: mortgage tier is not set', async function () {
        await comptroller.unsetMortgageTier(level);
        await expect(fundImplementation.finalize()).to.be.revertedWith(
          'RevertCode(8)' // IMPLEMENTATION_INVALID_MORTGAGE_TIER
        );
      });

      it('should revert: asset list is not empty', async function () {
        await fundImplementation.setState(FUND_STATE.EXECUTING);
        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);
        await fundImplementation.addAsset(tokenA.address);
        await fundImplementation.setState(FUND_STATE.REVIEWING);
        await expect(fundImplementation.finalize()).to.be.revertedWith(
          'RevertCode(6)' // IMPLEMENTATION_ASSET_LIST_NOT_EMPTY
        );
      });
    });

    it('resume', async function () {
      await fundImplementation.finalize();
      await fundImplementation.pendMock();
      await expect(fundImplementation.resume())
        .to.emit(fundImplementation, 'StateTransited')
        .withArgs(FUND_STATE.EXECUTING);
      expect(await fundImplementation.getAssetList()).to.be.deep.eq([denomination.address]);
      expect(await fundImplementation.pendingStartTime()).to.be.eq(0);
    });

    describe('Liquidate', function () {
      it('liquidate', async function () {
        const nts = await shareToken.netTotalShare();
        await fundImplementation.finalize();
        await fundImplementation.pendMock();
        await network.provider.send('evm_increaseTime', [pendingExpiration]);
        await expect(fundImplementation.liquidate())
          .to.emit(fundImplementation, 'StateTransited')
          .withArgs(FUND_STATE.LIQUIDATING)
          .to.emit(fundImplementation, 'OwnershipTransferred')
          .withArgs(owner.address, liquidator.address);
        expect(await fundImplementation.pendingStartTime()).to.be.eq(0);
      });

      it('liquidate by user', async function () {
        await fundImplementation.finalize();
        await fundImplementation.pendMock();
        await network.provider.send('evm_increaseTime', [pendingExpiration]);
        await expect(fundImplementation.connect(user).liquidate())
          .to.emit(fundImplementation, 'StateTransited')
          .withArgs(FUND_STATE.LIQUIDATING)
          .to.emit(fundImplementation, 'OwnershipTransferred')
          .withArgs(owner.address, liquidator.address);
      });

      it('should revert: pending does not start', async function () {
        await fundImplementation.finalize();
        await expect(fundImplementation.liquidate()).to.be.revertedWith(
          'RevertCode(10)' // IMPLEMENTATION_PENDING_NOT_START
        );
      });

      it('should revert: pending does not expire', async function () {
        await fundImplementation.finalize();
        await fundImplementation.pendMock();
        await expect(fundImplementation.liquidate()).to.be.revertedWith(
          'RevertCode(11)' // IMPLEMENTATION_PENDING_NOT_EXPIRE
        );
      });
    });

    describe('Close', function () {
      it('close when executing', async function () {
        await fundImplementation.finalize();
        await expect(fundImplementation.close())
          .to.emit(fundImplementation, 'StateTransited')
          .withArgs(FUND_STATE.CLOSED);
      });

      it('should revert: close by non-owner', async function () {
        await expect(fundImplementation.connect(user).close()).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  describe('Asset module', function () {
    beforeEach(async function () {
      await fundImplementation.finalize();
    });

    describe('add asset', function () {
      it('when amount > dust', async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

        // Transfer asset to vault
        await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);

        // Add asset
        await fundImplementation.addAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.be.deep.eq([denomination.address, tokenA.address]);
      });

      it('when amount = dust ', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust.add(mwei('0.000001')),
          tokenA.address
        );

        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA.connect(tokenAProvider).transfer(vault.address, dustAmount);

        expect(await fundImplementation.getAssetValue(tokenA.address)).to.be.eq(denominationDust);

        await fundImplementation.addAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.be.deep.eq([denomination.address, tokenA.address]);
      });

      it('add debt asset ', async function () {
        await comptroller.permitAssets(level, [tokenC.address]);
        await tokenC.connect(tokenCProvider).transfer(vault.address, BigNumber.from('1'));
        await fundImplementation.addAsset(tokenC.address);
        expect(await fundImplementation.getAssetList()).to.deep.include(tokenC.address);
      });

      it('should revert: add by non-owner', async function () {
        await expect(fundImplementation.connect(user).addAsset(tokenA.address)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('should revert: asset is not permitted', async function () {
        await expect(fundImplementation.addAsset(tokenA.address)).to.be.revertedWith('RevertCode(12)'); // IMPLEMENTATION_INVALID_ASSET
      });

      it('should revert: reach maximum asset capacity', async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address]);

        // Set asset capacity
        await comptroller.setAssetCapacity(0);

        // Transfer asset to vault
        await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);

        // Add asset
        await expect(fundImplementation.addAsset(tokenA.address)).to.be.revertedWith('RevertCode(63)'); // ASSET_MODULE_FULL_ASSET_CAPACITY
      });

      it('can not be added: zero balance of asset', async function () {
        await comptroller.permitAssets(level, [tokenA.address]);
        await fundImplementation.addAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.not.include(tokenA.address);
      });

      it('can not be added: balance of asset < dust ', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust.sub(BigNumber.from('10')),
          tokenA.address
        );

        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA.connect(tokenAProvider).transfer(vault.address, dustAmount);

        await fundImplementation.addAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.not.include(tokenA.address);
      });
    });

    describe('remove asset', function () {
      beforeEach(async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address, tokenC.address, denomination.address]);

        // Transfer asset to vault
        await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);
        await tokenC.connect(tokenCProvider).transfer(vault.address, tokenAAmount);

        await denomination.connect(denominationProvider).transfer(vault.address, denominationDust.mul(2));

        // Add asset
        await fundImplementation.addAsset(tokenA.address);
        await fundImplementation.addAsset(tokenC.address);
        await fundImplementation.addAsset(denomination.address);
      });

      it('normal', async function () {
        // Drain vault by sending token back to owner
        const amount = await tokenA.balanceOf(vault.address);
        const data = simpleEncode('transfer(address,uint256)', [owner.address, amount]);
        await fundImplementation.vaultCallMock(tokenA.address, data);
        await fundImplementation.removeAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.not.include(tokenA.address);
      });

      it('dust balance of asset', async function () {
        const dustAmount = await assetRouter.calcAssetValue(denomination.address, denominationDust, tokenA.address);

        // Drain vault by sending token back to owner
        const data = simpleEncode('transfer(address,uint256)', [owner.address, tokenAAmount.sub(dustAmount.div(2))]);
        await fundImplementation.vaultCallMock(tokenA.address, data);
        await fundImplementation.removeAsset(tokenA.address);

        expect(await fundImplementation.getAssetList()).to.not.include(tokenA.address);
      });

      it('should revert: remove by non-owner', async function () {
        await expect(fundImplementation.connect(user).removeAsset(tokenA.address)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('can not be removed: balance of asset > dust ', async function () {
        await fundImplementation.removeAsset(tokenA.address);
        expect(await fundImplementation.getAssetList()).to.deep.include(tokenA.address);
      });

      it('can not be removed: denomination', async function () {
        await fundImplementation.removeAsset(denomination.address);
        expect(await fundImplementation.getAssetList()).to.deep.include(denomination.address);
      });

      it('can not be removed: debt < zero', async function () {
        await fundImplementation.removeAsset(tokenC.address);
        expect(await fundImplementation.getAssetList()).to.deep.include(tokenC.address);
      });
    });
  });

  describe('Execute module', function () {
    const valueBefore = ethers.utils.parseEther('1');
    let actionData, executionData: any;
    beforeEach(async function () {
      await fundImplementation.finalize();
      await fundImplementation.setLastGrossAssetValue(valueBefore);
      actionData = getCallData(action, 'fooAddress', []);
      executionData = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [action.address],
        [constants.HashZero],
        [actionData],
      ]);
      await comptroller.permitDelegateCalls(await fundImplementation.level(), [action.address], [WL_ANY_SIG]);
    });

    it('normal', async function () {
      const valueCurrent = valueBefore.mul(valueTolerance).div(FUND_PERCENTAGE_BASE);
      await fundImplementation.setGrossAssetValueMock(valueCurrent);
      await fundImplementation.execute(executionData);
    });

    it('should revert: when exceed tolerance', async function () {
      const valueCurrent = valueBefore.mul(valueTolerance - 1).div(FUND_PERCENTAGE_BASE);
      await fundImplementation.setGrossAssetValueMock(valueCurrent);
      await expect(fundImplementation.execute(executionData)).to.be.revertedWith(
        'RevertCode(13)' // IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
      );
    });
  });

  describe('Setters', function () {
    describe('Management Fee Rate', function () {
      const feeRate = BigNumber.from('1000');

      it('set management fee rate', async function () {
        await fundImplementation.setManagementFeeRate(feeRate);
        expect(await fundImplementation.mFeeRate64x64()).to.be.eq(BigNumber.from('18446744135297203117'));
      });

      it('should revert: set management fee rate at wrong stage', async function () {
        await fundImplementation.finalize();
        await expect(fundImplementation.setManagementFeeRate(feeRate)).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(fundImplementation.connect(user).setManagementFeeRate(feeRate)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('should revert: set by max value', async function () {
        const maxRate = FUND_PERCENTAGE_BASE;
        await expect(fundImplementation.setManagementFeeRate(maxRate)).to.be.revertedWith('RevertCode(64)'); // MANAGEMENT_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_FUND_BASE
      });
    });

    describe('Performance Fee Rate', function () {
      const feeRate = 0;

      it('set performance fee rate', async function () {
        await fundImplementation.setPerformanceFeeRate(feeRate);
        expect(await fundImplementation.pFeeRate64x64()).to.be.eq(0);
      });

      it('should revert: set performance fee rate at wrong stage', async function () {
        await fundImplementation.finalize();
        await expect(fundImplementation.setPerformanceFeeRate(feeRate)).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(fundImplementation.connect(user).setPerformanceFeeRate(feeRate)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('should revert: set by max value', async function () {
        const maxRate = FUND_PERCENTAGE_BASE;
        await expect(fundImplementation.setPerformanceFeeRate(maxRate)).to.be.revertedWith('RevertCode(67)'); // PERFORMANCE_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_BASE
      });
    });

    describe('Crystallization Period', function () {
      const period = CRYSTALLIZATION_PERIOD_MIN + 1000;

      it('set crystallization period', async function () {
        await fundImplementation.setCrystallizationPeriod(period);
        expect(await fundImplementation.crystallizationPeriod()).to.be.eq(period);
      });

      it('should revert: set crystallization period at wrong stage', async function () {
        await fundImplementation.finalize();
        await expect(fundImplementation.setCrystallizationPeriod(period)).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(fundImplementation.connect(user).setCrystallizationPeriod(period)).to.be.revertedWith(
          'Ownable: caller is not the owner'
        );
      });

      it('should revert: set by too short period', async function () {
        const shortPeriod = CRYSTALLIZATION_PERIOD_MIN - 1;
        await expect(fundImplementation.setCrystallizationPeriod(shortPeriod)).to.be.revertedWith('RevertCode(68)'); // PERFORMANCE_FEE_MODULE_CRYSTALLIZATION_PERIOD_TOO_SHORT
      });
    });
  });

  describe('Getters', function () {
    beforeEach(async function () {
      await fundImplementation.finalize();
    });

    it('get asset total value', async function () {
      // Get expected amount
      const expectedA = await oracle.calcConversionAmount(tokenA.address, tokenAAmount, denomination.address);
      const expectedB = await oracle.calcConversionAmount(tokenB.address, tokenBAmount, denomination.address);

      // Permit asset
      await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

      // Transfer assets to vault
      await tokenA.connect(tokenAProvider).transfer(vault.address, tokenAAmount);
      await tokenB.connect(tokenBProvider).transfer(vault.address, tokenBAmount);

      // Add assets to tracking list
      await fundImplementation.addAsset(tokenA.address);
      await fundImplementation.addAsset(tokenB.address);

      const value = await fundImplementation.getGrossAssetValue();
      expect(value).to.be.eq(expectedA.add(expectedB));
    });

    it('zero total value', async function () {
      expect(await fundImplementation.getGrossAssetValue()).to.be.eq(0);
    });
  });

  describe('Settle pending share', function () {
    let redeemAmount: BigNumber;
    beforeEach(async function () {
      await fundImplementation.finalize();

      const currentReserve = await fundImplementation.getReserve();

      redeemAmount = currentReserve.add(mwei('500'));
      await denomination.connect(denominationProvider).transfer(owner.address, redeemAmount.mul(2)); // Transfer more to owner

      // Make a purchase, let fund update some data. (ex: lastMFeeClaimTime)
      await fundImplementation.setGrossAssetValueMock(mwei('5000'));
      await denomination.connect(owner).approve(fundImplementation.address, 1500);
      await fundImplementation.purchase(1500);

      // Make fund go to Pending state
      const redeemShare = await fundImplementation.calculateShare(redeemAmount);
      await fundImplementation.mint(owner.address, redeemShare);
      await fundImplementation.redeem(redeemShare, true);

      expect(await fundImplementation.state()).to.be.eq(FUND_STATE.PENDING);

      // Transfer some money to vault, so that able to resolve pending state
      await denomination.connect(denominationProvider).transfer(vault.address, redeemAmount.mul(2));
    });

    it('resolve Pending state after execute', async function () {
      // Prepare task data and execute
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint1', [foo.address, expectNValue]);

      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      // Permit delegate calls
      await comptroller.permitDelegateCalls(await fundImplementation.level(), [fooAction.address], [WL_ANY_SIG]);
      await expect(await fundImplementation.execute(data))
        .to.emit(fundImplementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
      expect(await fundImplementation.state()).to.be.eq(FUND_STATE.EXECUTING);
    });

    it('resolve Pending state after purchase', async function () {
      // Prepare task data and execute
      const purchaseAmount = mwei('1000');
      await denomination.connect(owner).approve(fundImplementation.address, purchaseAmount);

      await expect(fundImplementation.purchase(purchaseAmount))
        .to.emit(fundImplementation, 'Redeemed')
        .to.emit(fundImplementation, 'Purchased');
      expect(await fundImplementation.state()).to.be.eq(FUND_STATE.EXECUTING);
    });

    it('settle pending share when close', async function () {
      // Go to liquidating state
      await increaseNextBlockTimeBy(pendingExpiration);
      await expect(fundImplementation.liquidate())
        .to.emit(fundImplementation, 'StateTransited')
        .withArgs(4)
        .to.emit(fundImplementation, 'OwnershipTransferred')
        .withArgs(owner.address, liquidator.address);

      // Close
      await expect(await fundImplementation.connect(liquidator).close())
        .to.emit(fundImplementation, 'StateTransited')
        .withArgs(FUND_STATE.CLOSED)
        .to.emit(fundImplementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
    });

    it('should revert: pending share is not resolvable', async function () {
      await fundImplementation.setGrossAssetValueMock(redeemAmount.mul(100));
      await expect(fundImplementation.resume()).to.be.revertedWith(
        'RevertCode(9)' // IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE
      );
    });
  });
});
