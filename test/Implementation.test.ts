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
  SimpleToken,
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
} from './utils/constants';

import { simpleEncode, tokenProviderQuick } from './utils/utils';

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
  const managementFeeRate = 0; // 0%
  const performanceFeeRate = 1000; // 10%
  const pendingExpiration = 86400; // 1 day
  const CRYSTALLIZATION_PERIOD_MIN = 86400; // 1 day
  const crystallizationPeriod = CRYSTALLIZATION_PERIOD_MIN;
  const level = 1;
  const reserveExecution = 0;

  let comptroller: Comptroller;
  let implementation: ImplementationMock;
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

      shareToken = await (await ethers.getContractFactory('SimpleToken'))
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
          managementFeeRate,
          performanceFeeRate,
          crystallizationPeriod,
          reserveExecution,
          owner.address
        );

      vault = await ethers.getContractAt(
        'IDSProxy',
        await implementation.vault()
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('State changes', function () {
    describe('Initialize', function () {
      it('should set level', async function () {
        const _level = await implementation.level();
        expect(_level).to.be.gt(0);
        expect(_level).to.be.eq(level);
      });

      it('should set comptroller', async function () {
        const comptrollerAddr = await implementation.comptroller();
        expect(comptrollerAddr).to.be.not.eq(constants.AddressZero);
        expect(comptrollerAddr).to.be.eq(comptroller.address);
      });

      it('should set denomination', async function () {
        const denominationAddr = await implementation.denomination();
        expect(denominationAddr).to.be.not.eq(constants.AddressZero);
        expect(denominationAddr).to.be.eq(denomination.address);
      });

      it('should set share token', async function () {
        const shareTokenAddr = await implementation.shareToken();
        expect(shareTokenAddr).to.be.not.eq(constants.AddressZero);
        expect(shareTokenAddr).to.be.eq(shareToken.address);
      });

      it('should set management fee rate', async function () {
        const feeRate = await implementation.getManagementFeeRate();
        expect(feeRate).to.be.eq(BigNumber.from('18446744073709551616'));
      });

      it('should set performance fee rate', async function () {
        const feeRate = await implementation.getFeeRate();
        expect(feeRate).to.be.eq(BigNumber.from('1844674407370955161'));
      });

      it('should set crystallization period', async function () {
        const _crystallizationPeriod =
          await implementation.getCrystallizationPeriod();
        expect(_crystallizationPeriod).to.be.gte(CRYSTALLIZATION_PERIOD_MIN);
        expect(_crystallizationPeriod).to.be.eq(crystallizationPeriod);
      });

      it('should set vault', async function () {
        expect(await implementation.vault()).to.be.not.eq(
          constants.AddressZero
        );
      });

      it('should set owner', async function () {
        const _owner = await implementation.owner();
        expect(_owner).to.be.not.eq(constants.AddressZero);
        expect(_owner).to.be.eq(owner.address);
      });

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
    });

    describe('Finalize', function () {
      it('should success', async function () {
        await implementation.finalize();
        expect(await implementation.getAssetList()).to.be.deep.eq([
          denomination.address,
        ]);

        // check vault approval
        const allowance = await denomination.allowance(
          vault.address,
          implementation.address
        );
        expect(allowance).to.be.eq(constants.MaxUint256);
      });

      it('should revert: finalize by non-owner', async function () {
        await expect(
          implementation.connect(user).finalize()
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: finalize after denomination is forbidden', async function () {
        await comptroller.forbidDenominations([denomination.address]);
        await expect(implementation.finalize()).to.be.revertedWith(
          'Denomination is not valid'
        );
      });
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

    describe('Liquidate', function () {
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
    });

    describe('Close', function () {
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
    describe('Denomination', function () {
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

      it('should revert: set by zero address', async function () {
        await comptroller.permitDenominations(
          [constants.AddressZero],
          [denominationDust]
        );
        await expect(
          implementation.setDenomination(constants.AddressZero)
        ).to.be.revertedWith('Denomination should not be 0');
      });
    });

    describe('Management Fee Rate', function () {
      const feeRate = BigNumber.from('1000');

      it('set management fee rate', async function () {
        await implementation.setManagementFeeRate(feeRate);
        expect(await implementation.getManagementFeeRate()).to.be.eq(
          BigNumber.from('18446744135297203117')
        );
      });

      it('should revert: set management fee rate at wrong stage', async function () {
        await implementation.finalize();
        await expect(
          implementation.setManagementFeeRate(feeRate)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          implementation.connect(user).setManagementFeeRate(feeRate)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by max value', async function () {
        const maxRate = 1e4;
        await expect(
          implementation.setManagementFeeRate(maxRate)
        ).to.be.revertedWith('fee should be less than 100%');
      });
    });

    describe('Performance Fee Rate', function () {
      const feeRate = BigNumber.from('0');

      it('set performance fee rate', async function () {
        await implementation.setPerformanceFeeRate(feeRate);
        expect(await implementation.getFeeRate()).to.be.eq(BigNumber.from('0'));
      });

      it('should revert: set performance fee rate at wrong stage', async function () {
        await implementation.finalize();
        await expect(
          implementation.setPerformanceFeeRate(feeRate)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          implementation.connect(user).setPerformanceFeeRate(feeRate)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by max value', async function () {
        const maxRate = 1e4;
        await expect(
          implementation.setPerformanceFeeRate(maxRate)
        ).to.be.revertedWith('fee should be less than 100%');
      });
    });

    describe('Crystallization Period', function () {
      const period = CRYSTALLIZATION_PERIOD_MIN + 1000;

      it('set crystallization period', async function () {
        await implementation.setCrystallizationPeriod(period);
        expect(await implementation.getCrystallizationPeriod()).to.be.eq(
          period
        );
      });

      it('should revert: set crystallization period at wrong stage', async function () {
        await implementation.finalize();
        await expect(
          implementation.setCrystallizationPeriod(period)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          implementation.connect(user).setCrystallizationPeriod(period)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should revert: set by too short period', async function () {
        const shortPeriod = CRYSTALLIZATION_PERIOD_MIN - 1;
        await expect(
          implementation.setCrystallizationPeriod(shortPeriod)
        ).to.be.revertedWith('Crystallization period too short');
      });
    });

    describe('Reserve Execution', function () {
      it('set reserve execution', async function () {
        await implementation.setReserveExecution(denominationDust);
        expect(await implementation.reserveExecution()).to.be.eq(
          denominationDust
        );
      });

      it('should revert: set reserve execution at wrong stage', async function () {
        await implementation.finalize();
        await expect(
          implementation.setReserveExecution(denominationDust)
        ).to.be.revertedWith('InvalidState(2)');
      });

      it('should revert: set by non-owner', async function () {
        await expect(
          implementation.connect(user).setReserveExecution(denominationDust)
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
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
});
