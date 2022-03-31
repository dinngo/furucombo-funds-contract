import { Wallet, Signer } from 'ethers';
import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';

import {
  FurucomboRegistry,
  FurucomboProxy,
  FundImplementation,
  IERC20,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ShareToken,
  Chainlink,
  ComptrollerImplementation,
  AssetRouter,
} from '../../typechain';

import { mwei, impersonateAndInjectEther, ether } from '../utils/utils';

import { createFund } from './fund';
import { deployFurucomboProxyAndRegistry } from './deploy';
import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  USDC_PROVIDER,
  ONE_DAY,
  DAI_PROVIDER,
  LINK_TOKEN,
} from '../utils/constants';

describe('ManagerOperateAsset', function () {
  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;
  let denominationProvider: Signer;
  let tokenAProvider: Signer;
  let fundVault: Signer;

  const denominationProviderAddress = USDC_PROVIDER;
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAProviderAddress = DAI_PROVIDER;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = 200; // 2%
  const pendingExpiration = ONE_DAY; // 1 day
  const valueTolerance = 0;
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRatio = 0; // 0%

  const initialFunds = mwei('3000');
  const transferAmount = ether('3000');

  const shareTokenName = 'TEST';

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let oracle: Chainlink;

  let fundProxy: FundImplementation;
  let comptrollerProxy: ComptrollerImplementation;
  let assetRouter: AssetRouter;

  let denomination: IERC20;
  let tokenA: IERC20;
  let shareToken: ShareToken;

  let poolVaultAddress: string;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    tokenAProvider = await impersonateAndInjectEther(tokenAProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [
      fundProxy,
      poolVaultAddress,
      denomination,
      shareToken,
      taskExecutor,
      aFurucombo,
      hFunds,
      tokenA,
      ,
      oracle,
      comptrollerProxy,
      assetRouter,
    ] = await createFund(
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
      mFeeRate,
      pFeeRate,
      execFeePercentage,
      pendingExpiration,
      valueTolerance,
      crystallizationPeriod,
      reserveExecutionRatio,
      shareTokenName,
      fRegistry,
      furucombo
    );

    fundVault = await impersonateAndInjectEther(poolVaultAddress);

    // Transfer token to investors
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    await denomination.connect(denominationProvider).transfer(manager.address, initialFunds);
  });
  beforeEach(async function () {
    await setupTest();
  });

  describe('add asset', function () {
    it('in assetList', async function () {
      const beforeAssetList = await fundProxy.getAssetList();
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      const afterAssetList = await fundProxy.getAssetList();
      expect(afterAssetList.length - beforeAssetList.length).to.be.eq(1);
      expect(afterAssetList[afterAssetList.length - 1]).to.be.eq(tokenA.address);
    });
    it('increase right token amount', async function () {
      const beforeAssetAmount = await tokenA.balanceOf(poolVaultAddress);
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      const afterAssetAmount = await tokenA.balanceOf(poolVaultAddress);
      expect(afterAssetAmount.sub(beforeAssetAmount)).to.be.eq(transferAmount);
    });
    it('increase right total asset value', async function () {
      const beforeTotalAssetValue = await fundProxy.getGrossAssetValue();

      const assetValue = await assetRouter.calcAssetValue(tokenA.address, transferAmount, denomination.address);
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      const afterTotalAssetValue = await fundProxy.getGrossAssetValue();

      expect(afterTotalAssetValue).to.be.gt(beforeTotalAssetValue);
      expect(afterTotalAssetValue.sub(beforeTotalAssetValue)).to.be.eq(assetValue);
    });
    it('emit event', async function () {
      await tokenA.connect(tokenAProvider).transfer(poolVaultAddress, transferAmount);
      await expect(fundProxy.connect(manager).addAsset(tokenA.address))
        .to.emit(fundProxy, 'AssetAdded')
        .withArgs(tokenA.address);
    });
    it('do nothing when asset value < dust', async function () {
      const beforeAssetList = await fundProxy.getAssetList();
      await fundProxy.connect(manager).addAsset(tokenA.address);
      const afterAssetList = await fundProxy.getAssetList();
      expect(afterAssetList).to.be.deep.eq(beforeAssetList);
    });
    it('should revert: by non-manager', async function () {
      await tokenA.connect(tokenAProvider).transfer(poolVaultAddress, transferAmount);
      await expect(fundProxy.addAsset(tokenA.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert: invalid asset', async function () {
      const invalidToken = LINK_TOKEN;
      await expect(fundProxy.connect(manager).addAsset(invalidToken)).to.be.revertedWith('RevertCode(11)'); //IMPLEMENTATION_INVALID_ASSET
    });
  });
  describe('remove asset', function () {
    it('from assetList', async function () {
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      const beforeAssetList = await fundProxy.getAssetList();
      await _removeAsset(tokenA, transferAmount);
      const afterAssetList = await fundProxy.getAssetList();
      expect(afterAssetList.length).to.be.eq(beforeAssetList.length - 1);
    });
    it('emit event', async function () {
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      await tokenA.connect(fundVault).transfer(manager.address, transferAmount);
      await expect(fundProxy.connect(manager).removeAsset(tokenA.address))
        .to.emit(fundProxy, 'AssetRemoved')
        .withArgs(tokenA.address);
    });
    it('do nothing when value > dust', async function () {
      await _addAsset(tokenA, tokenAProvider, transferAmount);
      const beforeAssetList = await fundProxy.getAssetList();
      await fundProxy.connect(manager).removeAsset(tokenA.address);
      const afterAssetList = await fundProxy.getAssetList();
      expect(afterAssetList).to.be.deep.eq(beforeAssetList);
    });
    it('do nothing when remove denomination', async function () {
      const beforeAssetList = await fundProxy.getAssetList();
      await fundProxy.connect(manager).removeAsset(denomination.address);
      const afterAssetList = await fundProxy.getAssetList();
      expect(afterAssetList).to.be.deep.eq(beforeAssetList);
    });
    it('should revert: by non-manager', async function () {
      await expect(fundProxy.removeAsset(tokenA.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
  async function _addAsset(token: IERC20, tokenProvider: Signer, transferAmount: any) {
    await token.connect(tokenProvider).transfer(poolVaultAddress, transferAmount);
    await fundProxy.connect(manager).addAsset(token.address);
  }
  async function _removeAsset(token: IERC20, transferAmount: any) {
    await token.connect(fundVault).transfer(manager.address, transferAmount);
    await fundProxy.connect(manager).removeAsset(token.address);
  }
});
