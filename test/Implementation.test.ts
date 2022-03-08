import { ethers, deployments, network } from 'hardhat';
import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { expect } from 'chai';
import {
  Comptroller,
  ImplementationMock,
  IDSProxy,
  Chainlink,
  ERC20,
  AssetRouter,
  MortgageVault,
  PoolFooAction,
  PoolFoo,
  TaskExecutor,
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
} from './utils/constants';

import {
  simpleEncode,
  tokenProviderQuick,
  mwei,
  getCallData,
  increaseNextBlockTimeBy,
} from './utils/utils';

describe('Implementation', function () {
  const denominationAddress = USDC_TOKEN;
  const denominationAggregator = CHAINLINK_USDC_USD;
  const denominationDust = ethers.utils.parseUnits('0.1', 6);
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = WBTC_TOKEN;
  const tokenCAddress = BAT_TOKEN;
  const aggregatorA = CHAINLINK_ETH_USD;
  const aggregatorB = CHAINLINK_WBTC_USD;
  const tokenAAmount = ethers.utils.parseEther('1');
  const tokenBAmount = ethers.utils.parseUnits('1', 8);
  const execFeePercentage = 200; // 20%
  const pendingExpiration = 43200; // 0.5 day
  const level = 1;
  const reserveBase = FEE_BASE;

  let comptroller: Comptroller;
  let implementation: ImplementationMock;
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

      implementation = await (
        await ethers.getContractFactory('ImplementationMock')
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
        await ethers.getContractFactory('Comptroller')
      ).deploy(
        implementation.address,
        assetRouter.address,
        owner.address,
        execFeePercentage,
        liquidator.address,
        pendingExpiration,
        mortgageVault.address
      );

      // Initialization
      await comptroller.permitDenominations(
        [denomination.address],
        [denominationDust]
      );
      await comptroller.permitAssets(level, [denomination.address]);

      const shareToken = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await shareToken.deployed();

      await implementation
        .connect(owner)
        .initialize(
          level,
          comptroller.address,
          denomination.address,
          shareToken.address,
          200,
          200,
          10,
          0,
          owner.address
        );

      vault = await ethers.getContractAt(
        'IDSProxy',
        await implementation.vault()
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
    await implementation.finalize();

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
    await implementation.addAsset(tokenA.address);
    await implementation.addAsset(tokenB.address);

    const value = await implementation.getTotalAssetValue();
    expect(value).to.be.eq(expectedA.add(expectedB));

    // Transfer 10% of total asset value, this makes currentReserve percentage close to 1/11.
    const denominationReserve = value.div(10);
    await denomination
      .connect(denominationProvider)
      .transfer(vault.address, denominationReserve);

    const totalAssetValue = await implementation.getTotalAssetValue();
    const currentReserveRatio = denominationReserve
      .mul(reserveBase)
      .div(totalAssetValue);

    return currentReserveRatio;
  }

  beforeEach(async function () {
    await setupTest();
  });

  describe('State changes', function () {
    it('should revert: twice initialization', async function () {
      await expect(
        implementation
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

    it('finalize', async function () {
      let allowance;

      await implementation.finalize();
      expect(await implementation.getAssetList()).to.be.deep.eq([
        denomination.address,
      ]);

      // check vault approval
      allowance = await denomination.allowance(
        vault.address,
        implementation.address
      );
      expect(allowance).to.be.eq(constants.MaxUint256);
    });

    it('should revert: finalize by non-owner', async function () {
      await expect(implementation.connect(user).finalize()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('resume', async function () {
      await implementation.finalize();
      await implementation.pendMock();
      await expect(implementation.resume())
        .to.emit(implementation, 'StateTransited')
        .withArgs(2);
      expect(await implementation.getAssetList()).to.be.deep.eq([
        denomination.address,
      ]);
      expect(await implementation.pendingStartTime()).to.be.eq(0);
    });

    it('liquidate', async function () {
      await implementation.finalize();
      await implementation.pendMock();
      await network.provider.send('evm_increaseTime', [pendingExpiration]);
      await expect(implementation.liquidate())
        .to.emit(implementation, 'StateTransited')
        .withArgs(4)
        .to.emit(implementation, 'OwnershipTransferred')
        .withArgs(owner.address, liquidator.address);
      expect(await implementation.pendingStartTime()).to.be.eq(0);
    });

    it('liquidate by user', async function () {
      await implementation.finalize();
      await implementation.pendMock();
      await network.provider.send('evm_increaseTime', [pendingExpiration]);
      await expect(implementation.connect(user).liquidate())
        .to.emit(implementation, 'StateTransited')
        .withArgs(4)
        .to.emit(implementation, 'OwnershipTransferred')
        .withArgs(owner.address, liquidator.address);
    });

    it('should revert: pending does not start', async function () {
      await implementation.finalize();
      await expect(implementation.liquidate()).to.be.revertedWith(
        'Pending does not start'
      );
    });

    it('should revert: pending does not expire', async function () {
      await implementation.finalize();
      await implementation.pendMock();
      await expect(implementation.liquidate()).to.be.revertedWith(
        'Pending does not expire'
      );
    });

    it('close when executing', async function () {
      await implementation.finalize();
      await expect(implementation.close())
        .to.emit(implementation, 'StateTransited')
        .withArgs(5);
    });

    it('should revert: close by non-owner', async function () {
      await expect(implementation.connect(user).close()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('Asset module', function () {
    beforeEach(async function () {
      await implementation.finalize();
    });

    describe('add asset', function () {
      it('normal', async function () {
        // Permit asset
        await comptroller.permitAssets(level, [tokenA.address, tokenB.address]);

        // Transfer asset to vault
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, tokenAAmount);

        // Add asset
        await implementation.addAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.be.deep.eq([
          denomination.address,
          tokenA.address,
        ]);
      });

      it('add debt asset ', async function () {
        await comptroller.permitAssets(level, [tokenC.address]);
        await tokenC
          .connect(tokenCProvider)
          .transfer(vault.address, BigNumber.from('1'));
        await implementation.addAsset(tokenC.address);
        expect(await implementation.getAssetList()).to.deep.include(
          tokenC.address
        );
      });

      it('should revert: add by non-owner', async function () {
        await expect(
          implementation.connect(user).addAsset(tokenA.address)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: asset is not permitted', async function () {
        await expect(
          implementation.addAsset(tokenA.address)
        ).to.be.revertedWith('Invalid asset');
      });

      it('can not be added: zero balance of asset', async function () {
        await comptroller.permitAssets(level, [tokenA.address]);
        await implementation.addAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });

      it('can not be added: balance of asset < dust ', async function () {
        const dustAmount = await assetRouter.calcAssetValue(
          denomination.address,
          denominationDust,
          tokenA.address
        );

        await comptroller.permitAssets(level, [tokenA.address]);
        await tokenA
          .connect(tokenAProvider)
          .transfer(vault.address, dustAmount);
        await implementation.addAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.not.include(
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
        await implementation.addAsset(tokenA.address);
        await implementation.addAsset(tokenC.address);
        await implementation.addAsset(denomination.address);
      });

      it('normal', async function () {
        // Drain vault by sending token back to owner
        const amount = await tokenA.balanceOf(vault.address);
        const data = simpleEncode('transfer(address,uint256)', [
          owner.address,
          amount,
        ]);
        await implementation.vaultCallMock(tokenA.address, data);
        await implementation.removeAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.not.include(
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
        await implementation.vaultCallMock(tokenA.address, data);
        await implementation.removeAsset(tokenA.address);

        expect(await implementation.getAssetList()).to.not.include(
          tokenA.address
        );
      });

      it('should revert: remove by non-owner', async function () {
        await expect(
          implementation.connect(user).removeAsset(tokenA.address)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('can not be removed: balance of asset > dust ', async function () {
        await implementation.removeAsset(tokenA.address);
        expect(await implementation.getAssetList()).to.deep.include(
          tokenA.address
        );
      });

      it('can not be removed: denomination', async function () {
        await implementation.removeAsset(denomination.address);
        expect(await implementation.getAssetList()).to.deep.include(
          denomination.address
        );
      });

      it('can not be removed: debt < zero', async function () {
        await implementation.removeAsset(tokenC.address);
        expect(await implementation.getAssetList()).to.deep.include(
          tokenC.address
        );
      });
    });
  });

  describe('Setters', function () {
    it('set denomination', async function () {
      await comptroller.permitDenominations([tokenA.address], [tokenAAmount]);
      await implementation.setDenomination(tokenA.address);
      expect(await implementation.denomination()).to.be.eq(tokenA.address);
    });

    it('should revert: set denomination at wrong stage', async function () {
      await implementation.finalize();
      await expect(
        implementation.setDenomination(tokenA.address)
      ).to.be.revertedWith('InvalidState(2)');
    });

    it('should revert: set by non-owner', async function () {
      await expect(
        implementation.connect(user).setDenomination(tokenA.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('set reserve execution', async function () {
      await implementation.setReserveExecutionRatio(denominationDust);
      expect(await implementation.reserveExecutionRatio()).to.be.eq(
        denominationDust
      );
    });

    it('should revert: set reserve execution at wrong stage', async function () {
      await implementation.finalize();
      await expect(
        implementation.setReserveExecutionRatio(denominationDust)
      ).to.be.revertedWith('InvalidState(2)');
    });

    it('should revert: set by non-owner', async function () {
      await expect(
        implementation.connect(user).setReserveExecutionRatio(denominationDust)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('Getters', function () {
    beforeEach(async function () {
      await implementation.finalize();
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
      await implementation.addAsset(tokenA.address);
      await implementation.addAsset(tokenB.address);

      const value = await implementation.getTotalAssetValue();
      expect(value).to.be.eq(expectedA.add(expectedB));
    });

    it('zero total value', async function () {
      expect(await implementation.getTotalAssetValue()).to.be.eq(0);
    });
  });

  describe('Reserve', function () {
    let currentReserveRatio = constants.Zero;

    beforeEach(async function () {
      currentReserveRatio = await transferAssetToVault();
      implementation.reviewingMock();
    });

    it('reserve is totally enough', async function () {
      await implementation.setReserveExecutionRatio(100); // 1%
      expect(await implementation.isReserveEnough()).to.be.eq(true);
    });

    it('reserve is a little bit more than setting', async function () {
      await implementation.setReserveExecutionRatio(currentReserveRatio.sub(5)); // reserveExecution is 0.05% below currentReserve
      expect(await implementation.isReserveEnough()).to.be.eq(true);
    });

    it('reserve is totally not enough', async function () {
      await implementation.setReserveExecutionRatio(1500); // 15%
      expect(await implementation.isReserveEnough()).to.be.eq(false);
    });

    it('reserve is a little bit less than setting', async function () {
      await implementation.setReserveExecutionRatio(currentReserveRatio.add(5)); // reserveExecution is 0.05% above currentReserve
      expect(await implementation.isReserveEnough()).to.be.eq(false);
    });
  });

  describe.only('execute', function () {
    beforeEach(async function () {
      await transferAssetToVault();
      const currentReserve = await implementation.getReserve();

      const redeemAmount = currentReserve.add(mwei('500'));
      await denomination
        .connect(denominationProvider)
        .transfer(owner.address, redeemAmount.mul(2)); // Transfer more to owner

      // Make a purchase, let fund update some data. (ex: lastMFeeClaimTime)
      await denomination.connect(owner).approve(implementation.address, 500);
      await implementation.purchase(500);

      // Make fund go to RedemptionPending state
      const redeemShare = await implementation.calculateShare(redeemAmount);
      await implementation.redeem(redeemShare);
      expect(await implementation.state()).to.be.eq(3); // RedemptionPending

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
        await implementation.level(),
        [fooAction.address],
        [WL_ANY_SIG]
      );
      expect(await implementation.execute(data))
        .to.emit(implementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
      expect(await implementation.state()).to.be.eq(2); // Executing
    });

    it('settle pending redemption after execute when Liquidating', async function () {
      await increaseNextBlockTimeBy(pendingExpiration);
      await expect(implementation.liquidate())
        .to.emit(implementation, 'StateTransited')
        .withArgs(4)
        .to.emit(implementation, 'OwnershipTransferred')
        .withArgs(owner.address, liquidator.address);
      expect(await implementation.pendingStartTime()).to.be.eq(0);

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
        await implementation.level(),
        [fooAction.address],
        [WL_ANY_SIG]
      );

      expect(await implementation.connect(liquidator).execute(data))
        .to.emit(implementation, 'Redeemed')
        .to.emit(denomination, 'Transfer');
      expect(await implementation.state()).to.be.eq(4); // Liquidating
    });
  });
});
