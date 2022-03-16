import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  ComptrollerProxy,
  UpgradeableBeacon,
  PoolImplementation,
  AssetRouter,
  MortgageVault,
  TaskExecutor,
  Chainlink,
  AssetRegistry,
  SimpleToken,
  PoolProxyFactory,
} from '../typechain';
import { DS_PROXY_REGISTRY, DAI_TOKEN, WBTC_TOKEN } from './utils/constants';
import { getEventArgs } from './utils/utils';

describe('Comptroller', function () {
  let comptrollerImplementation: ComptrollerImplementation;
  let comptrollerProxy: ComptrollerProxy;
  let comptroller: ComptrollerImplementation;
  let beacon: UpgradeableBeacon;
  let poolImplementation: PoolImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let taskExecutor: TaskExecutor;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;
  let liquidator: Wallet;

  let oracle: Chainlink;
  let registry: AssetRegistry;
  let tokenM: SimpleToken;
  let tokenD: SimpleToken;
  let factory: PoolProxyFactory;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, collector, liquidator] = await (ethers as any).getSigners();

      tokenM = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenM.deployed();

      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();

      poolImplementation = await (
        await ethers.getContractFactory('PoolImplementation')
      ).deploy(DS_PROXY_REGISTRY);
      await poolImplementation.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await assetRouter.deployed();

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(tokenM.address);
      await mortgageVault.deployed();

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

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).attach(comptrollerProxy.address);

      const beaconAddress = await comptroller.callStatic.beacon();

      beacon = await (
        await ethers.getContractFactory('UpgradeableBeacon')
      ).attach(beaconAddress);

      taskExecutor = await (
        await ethers.getContractFactory('TaskExecutor')
      ).deploy(owner.address, comptroller.address);
      await taskExecutor.deployed();

      factory = await (
        await ethers.getContractFactory('PoolProxyFactory')
      ).deploy(comptroller.address);
      await factory.deployed();
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('Halt', function () {
    it('halt ', async function () {
      // check env before execution
      expect(await comptroller.fHalt()).to.equal(false);
      expect(await comptroller.implementation()).to.equal(
        poolImplementation.address
      );

      // halt
      await expect(comptroller.halt()).to.emit(comptroller, 'Halted');
      expect(await comptroller.fHalt()).to.equal(true);
      await expect(comptroller.implementation()).to.be.revertedWith(
        'Comptroller: Halted'
      );
    });

    it('unHalt ', async function () {
      // check env before execution
      await comptroller.halt();
      expect(await comptroller.fHalt()).to.equal(true);
      await expect(comptroller.implementation()).to.be.revertedWith(
        'Comptroller: Halted'
      );

      // unHalt
      await expect(comptroller.unHalt()).to.emit(comptroller, 'UnHalted');
      expect(await comptroller.fHalt()).to.equal(false);
      expect(await comptroller.implementation()).to.equal(
        poolImplementation.address
      );
    });

    it('should revert: halt by non-owner', async function () {
      await expect(comptroller.connect(user).halt()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('should revert: unHalt by non-owner', async function () {
      await expect(comptroller.connect(user).unHalt()).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  // ban/unban proxy
  describe('Ban proxy', function () {
    it('ban ', async function () {
      // check env before execution
      expect(await comptroller.bannedProxy(user.address)).to.equal(false);

      // ban proxy
      await expect(comptroller.banProxy(user.address))
        .to.emit(comptroller, 'ProxyBanned')
        .withArgs(user.address);

      // verify banned proxy
      expect(await comptroller.bannedProxy(user.address)).to.equal(true);
      await expect(
        comptroller.connect(user).implementation()
      ).to.be.revertedWith('Comptroller: Banned');
    });

    it('unBan ', async function () {
      // check env before execution
      await comptroller.banProxy(user.address);
      expect(await comptroller.bannedProxy(user.address)).to.equal(true);

      // unban proxy
      await expect(comptroller.unBanProxy(user.address))
        .to.emit(comptroller, 'ProxyUnbanned')
        .withArgs(user.address);

      // verify unbanned proxy
      expect(await comptroller.bannedProxy(user.address)).to.equal(false);
      expect(await comptroller.connect(user).implementation()).to.be.equal(
        poolImplementation.address
      );
    });

    it('should revert: ban by non-owner', async function () {
      await expect(
        comptroller.connect(user).banProxy(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: unBan by non-owner', async function () {
      await expect(
        comptroller.connect(user).unBanProxy(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // implementation
  describe('implementation', function () {
    it('set implementation', async function () {
      // check env before execution
      expect(await comptroller.connect(user).implementation()).to.be.equal(
        poolImplementation.address
      );

      // deploy new implementation
      const newImpl = await (
        await ethers.getContractFactory('PoolImplementation')
      ).deploy(DS_PROXY_REGISTRY);
      await newImpl.deployed();

      // set new implementation
      await expect(beacon.upgradeTo(newImpl.address))
        .to.emit(beacon, 'Upgraded')
        .withArgs(newImpl.address);

      // check new implementation
      expect(await comptroller.connect(user).implementation()).to.be.equal(
        newImpl.address
      );
    });

    it('should revert: set implementation by non-owner', async function () {
      await expect(
        beacon.connect(user).upgradeTo(poolImplementation.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // Asset
  describe('asset management', function () {
    const tokenA = WBTC_TOKEN;
    const tokenB = DAI_TOKEN;
    const otherLevel = 0;
    const level = 1;

    describe('permit/forbid assets', function () {
      it('permit assets', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAssets(level, [tokenA, tokenB])
        ).to.be.equal(false);

        // permit assets
        const receipt = await comptroller.permitAssets(level, [tokenA, tokenB]);

        // check events
        await expect(receipt)
          .to.emit(comptroller, 'PermitAsset')
          .withArgs(level, tokenA);
        await expect(receipt)
          .to.emit(comptroller, 'PermitAsset')
          .withArgs(level, tokenB);

        // check single asset
        expect(
          await comptroller.connect(user).isValidDealingAsset(level, tokenA)
        ).to.be.equal(true);

        // check multiple assets
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAssets(level, [tokenA, tokenB])
        ).to.be.equal(true);

        // not affect other level assets
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAsset(otherLevel, tokenA)
        ).to.be.equal(false);
      });

      it('forbid assets', async function () {
        // check env before execution
        await comptroller.permitAssets(otherLevel, [tokenA]);
        await comptroller.permitAssets(level, [tokenA, tokenB]);
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAssets(level, [tokenA, tokenB])
        ).to.be.equal(true);

        // forbid asset
        await expect(comptroller.forbidAssets(level, [tokenA]))
          .to.emit(comptroller, 'ForbidAsset')
          .withArgs(level, tokenA);

        // validate dealing asset
        // single asset
        expect(
          await comptroller.connect(user).isValidDealingAsset(level, tokenA)
        ).to.be.equal(false);

        expect(
          await comptroller.connect(user).isValidDealingAsset(level, tokenB)
        ).to.be.equal(true);

        // check multiple assets
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAssets(level, [tokenA, tokenB])
        ).to.be.equal(false);

        // not affect other level assets
        expect(
          await comptroller
            .connect(user)
            .isValidDealingAsset(otherLevel, tokenA)
        ).to.be.equal(true);
      });

      it('should revert: permit asset by non-owner', async function () {
        await expect(
          comptroller.connect(user).permitAssets(level, [tokenA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: forbid asset by non-owner', async function () {
        await expect(
          comptroller.connect(user).forbidAssets(level, [tokenA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('initial asset check', function () {
      beforeEach(async function () {
        // check env before execution
        await comptroller.permitAssets(level, [tokenA]);
        expect(
          await comptroller.connect(user).isValidInitialAssets(level, [tokenA])
        ).to.be.equal(true);
      });

      // validate initial asset
      it('update initial check flag', async function () {
        // check env before execution
        let check = false;
        await expect(comptroller.setInitialAssetCheck(check))
          .to.emit(comptroller, 'SetInitialAssetCheck')
          .withArgs(check);

        expect(
          await comptroller.connect(user).fInitialAssetCheck()
        ).to.be.equal(check);

        // set new implementation
        check = true;
        await expect(comptroller.setInitialAssetCheck(check))
          .to.emit(comptroller, 'SetInitialAssetCheck')
          .withArgs(check);

        // check initialCheck
        expect(
          await comptroller.connect(user).fInitialAssetCheck()
        ).to.be.equal(check);
      });

      it('non-authority initial asset', async function () {
        // enable initial asset check
        expect(
          await comptroller.connect(user).isValidInitialAsset(level, tokenA)
        ).to.be.equal(true);
        expect(
          await comptroller.connect(user).isValidInitialAsset(level, tokenB)
        ).to.be.equal(false);

        // check multiple assets
        expect(
          await comptroller
            .connect(user)
            .isValidInitialAssets(level, [tokenA, tokenB])
        ).to.be.equal(false);
      });

      it('authority initial asset', async function () {
        // enable initial asset check
        expect(
          await comptroller.connect(user).isValidInitialAsset(level, tokenA)
        ).to.be.equal(true);

        // check multiple assets
        expect(
          await comptroller.connect(user).isValidInitialAssets(level, [tokenA])
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .isValidInitialAssets(level, [tokenA, tokenB])
        ).to.be.equal(false);
      });

      it('always return true if initial check flag is false', async function () {
        await comptroller.setInitialAssetCheck(false);
        // check single asset
        expect(
          await comptroller.connect(user).isValidInitialAsset(level, tokenB)
        ).to.be.equal(true);

        // check multiple assets
        expect(
          await comptroller
            .connect(user)
            .isValidInitialAssets(level, [tokenA, tokenB])
        ).to.be.equal(true);
      });

      it('should revert: set initial check flag by non-owner', async function () {
        await expect(
          comptroller.connect(user).setInitialAssetCheck(true)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  // Denominations management
  describe('denomination management', function () {
    const tokenA = WBTC_TOKEN;
    const tokenB = DAI_TOKEN;
    const dustA = ethers.utils.parseUnits('0.00001', 8);
    const dustB = ethers.utils.parseUnits('0.1', 18);
    it('permit denominations', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).isValidDenomination(tokenA)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidDenomination(tokenB)
      ).to.be.equal(false);

      // permit new denominations
      const receipt = await comptroller.permitDenominations(
        [tokenA, tokenB],
        [dustA, dustB]
      );
      await expect(receipt)
        .to.emit(comptroller, 'PermitDenomination')
        .withArgs(tokenA, dustA);
      await expect(receipt)
        .to.emit(comptroller, 'PermitDenomination')
        .withArgs(tokenB, dustB);

      // check denominations
      expect(
        await comptroller.connect(user).isValidDenomination(tokenA)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidDenomination(tokenB)
      ).to.be.equal(true);

      // check dusts
      expect(
        await comptroller.connect(user).getDenominationDust(tokenA)
      ).to.be.equal(dustA);
      expect(
        await comptroller.connect(user).getDenominationDust(tokenB)
      ).to.be.equal(dustB);
    });

    it('forbid denominations', async function () {
      // check env before execution
      await comptroller.permitDenominations([tokenA, tokenB], [dustA, dustB]);
      expect(
        await comptroller.connect(user).isValidDenomination(tokenA)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidDenomination(tokenB)
      ).to.be.equal(true);

      // permit new denominations
      const receipt = await comptroller.forbidDenominations([tokenA, tokenB]);

      // check event
      await expect(receipt)
        .to.emit(comptroller, 'ForbidDenomination')
        .withArgs(tokenA);
      await expect(receipt)
        .to.emit(comptroller, 'ForbidDenomination')
        .withArgs(tokenB);

      expect(
        await comptroller.connect(user).isValidDenomination(tokenA)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidDenomination(tokenB)
      ).to.be.equal(false);
    });

    it('should revert: permit denominations by non-owner', async function () {
      await expect(
        comptroller
          .connect(user)
          .permitDenominations([tokenA, tokenB], [dustA, dustB])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: forbid denominations by non-owner', async function () {
      await expect(
        comptroller.connect(user).forbidDenominations([tokenA, tokenB])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // StakedTier management
  describe('staked tier management', function () {
    const level = 1;
    const otherLevel = 0;
    const stakeAmount = 5000;
    it('set staking tier', async function () {
      // check env before execution
      expect(await comptroller.connect(user).stakedTier(level)).to.be.equal(0);

      // set staked tier amount
      await expect(comptroller.setStakedTier(level, stakeAmount))
        .to.emit(comptroller, 'SetStakedTier')
        .withArgs(level, stakeAmount);

      // check staked tier
      expect(await comptroller.connect(user).stakedTier(level)).to.be.equal(
        stakeAmount
      );

      expect(
        await comptroller.connect(user).stakedTier(otherLevel)
      ).to.be.equal(0);
    });

    it('should revert: set staking tier by non-owner', async function () {
      await expect(
        comptroller.connect(user).setStakedTier(level, stakeAmount)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    describe('create pool', function () {
      const dustD = ethers.utils.parseUnits('0.1', 18);
      beforeEach(async function () {
        await comptroller.permitDenominations([tokenD.address], [dustD]);
        await comptroller.setStakedTier(level, stakeAmount);
      });

      it('should revert: invalid creator', async function () {
        await expect(
          factory
            .connect(user)
            .createPool(tokenD.address, 1, 0, 0, 300, 0, 'TEST')
        ).to.be.revertedWith('Invalid creator');
      });

      it('should stake for the given tier', async function () {
        const tokenMUserBefore = await tokenM.callStatic.balanceOf(
          user.address
        );
        const tokenMVaultBefore = await tokenM.callStatic.balanceOf(
          mortgageVault.address
        );
        await tokenM.connect(user).approve(mortgageVault.address, stakeAmount);
        await comptroller.permitCreators([user.address]);
        const receipt = await factory
          .connect(user)
          .createPool(tokenD.address, 1, 0, 0, 86400, 0, 'TEST');
        const pool = await getEventArgs(receipt, 'PoolCreated');
        const tokenMUserAfter = await tokenM.callStatic.balanceOf(user.address);
        const tokenMVaultAfter = await tokenM.callStatic.balanceOf(
          mortgageVault.address
        );
        const mortgagePool = await mortgageVault.callStatic.poolAmounts(
          pool[0]
        );
        expect(tokenMUserBefore.sub(tokenMUserAfter)).to.be.eq(stakeAmount);
        expect(tokenMVaultAfter.sub(tokenMVaultBefore)).to.be.eq(stakeAmount);
        expect(mortgagePool).to.be.eq(stakeAmount);
      });
    });
  });

  // asset router management
  describe('asset router', function () {
    it('set asset router', async function () {
      // check env before execution
      expect(await comptroller.connect(user).assetRouter()).to.be.equal(
        assetRouter.address
      );

      // deploy new asset router
      const newAssetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await newAssetRouter.deployed();

      // set new asset router
      await expect(comptroller.setAssetRouter(newAssetRouter.address))
        .to.emit(comptroller, 'SetAssetRouter')
        .withArgs(newAssetRouter.address);

      // check new asset router
      expect(await comptroller.connect(user).assetRouter()).to.be.equal(
        newAssetRouter.address
      );
    });

    it('should revert: set asset router by non-owner', async function () {
      await expect(
        comptroller.connect(user).setAssetRouter(assetRouter.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: set zero asset router', async function () {
      await expect(
        comptroller.connect(owner).setAssetRouter(constants.AddressZero)
      ).to.be.revertedWith('Comptroller: Zero address');
    });
  });

  // Fee
  describe('fee', function () {
    it('set fee collector', async function () {
      // check env before execution
      expect(await comptroller.connect(user).execFeeCollector()).to.be.equal(
        collector.address
      );

      // set new fee collector
      await expect(comptroller.setFeeCollector(user.address))
        .to.emit(comptroller, 'SetExecFeeCollector')
        .withArgs(user.address);

      // check new fee collector
      expect(await comptroller.connect(user).execFeeCollector()).to.be.equal(
        user.address
      );
    });

    it('should revert: set fee collector by non-owner', async function () {
      await expect(
        comptroller.connect(user).setFeeCollector(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: set zero address fee collector', async function () {
      await expect(
        comptroller.setFeeCollector(constants.AddressZero)
      ).to.be.revertedWith('Comptroller: Zero address');
    });

    it('set fee percentage', async function () {
      // check env before execution
      expect(await comptroller.connect(user).execFeePercentage()).to.be.equal(
        0
      );

      // set new fee percentage
      const percentage = BigNumber.from('20');
      await expect(comptroller.setExecFeePercentage(percentage))
        .to.emit(comptroller, 'SetExecFeePercentage')
        .withArgs(percentage);

      // check new fee percentage
      expect(await comptroller.connect(user).execFeePercentage()).to.be.equal(
        percentage
      );
    });

    it('should revert: set fee collector by non-owner', async function () {
      await expect(
        comptroller.connect(user).setExecFeePercentage(BigNumber.from('20'))
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // Pending redemption
  describe('Pending redemption', function () {
    const expiration = '86400'; // 1 day

    it('set liquidator', async function () {
      expect(await comptroller.pendingLiquidator()).to.be.eq(
        liquidator.address
      );

      await expect(
        comptroller.connect(owner).setPendingLiquidator(user.address)
      )
        .to.emit(comptroller, 'SetPendingLiquidator')
        .withArgs(user.address);

      expect(await comptroller.pendingLiquidator()).to.be.eq(user.address);
    });

    it('should revert: set liquidator by non-owner', async function () {
      await expect(
        comptroller.connect(user).setPendingLiquidator(user.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: set zero address liquidator', async function () {
      await expect(
        comptroller.setPendingLiquidator(constants.AddressZero)
      ).to.be.revertedWith('Comptroller: Zero address');
    });

    it('set expiration', async function () {
      expect(await comptroller.pendingExpiration()).to.be.eq(0);

      await expect(comptroller.setPendingExpiration(expiration))
        .to.emit(comptroller, 'SetPendingExpiration')
        .withArgs(expiration);

      expect(await comptroller.pendingExpiration()).to.be.eq(expiration);
    });

    it('should revert: set expiration by non-owner', async function () {
      await expect(
        comptroller.connect(user).setPendingExpiration(expiration)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // Execution action management
  describe('execution action', function () {
    it('set execution action', async function () {
      // check env before execution
      expect(await comptroller.connect(user).execAction()).to.be.equal(
        constants.AddressZero
      );

      // set new execution action
      await expect(comptroller.setExecAction(taskExecutor.address))
        .to.emit(comptroller, 'SetExecAction')
        .withArgs(taskExecutor.address);

      // check new executor action
      expect(await comptroller.connect(user).execAction()).to.be.equal(
        taskExecutor.address
      );
    });

    it('set execution action twice', async function () {
      // check env before execution
      await comptroller.setExecAction(collector.address);
      expect(await comptroller.connect(user).execAction()).to.be.equal(
        collector.address
      );

      // set new execution action
      await expect(comptroller.setExecAction(taskExecutor.address))
        .to.emit(comptroller, 'SetExecAction')
        .withArgs(taskExecutor.address);

      // check new executor action
      expect(await comptroller.connect(user).execAction()).to.be.equal(
        taskExecutor.address
      );
    });

    it('should revert: set execution action by non-owner', async function () {
      await expect(
        comptroller.connect(user).setExecAction(taskExecutor.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: set zero address execution action', async function () {
      await expect(
        comptroller.setExecAction(constants.AddressZero)
      ).to.be.revertedWith('Comptroller: Zero address');
    });
  });
});
