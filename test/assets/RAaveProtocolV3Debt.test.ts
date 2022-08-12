import { Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  RAaveProtocolV3Debt,
  RAaveProtocolV3DebtMock,
  IATokenV3,
  IPool,
  IERC20,
  IVariableDebtTokenV3,
  IStableDebtTokenV3,
} from '../../typechain';

import {
  USDC_TOKEN,
  AWETH_V3,
  AWETH_V3_PROVIDER,
  AAVEPROTOCOL_V3_PROVIDER,
  AAVE_RATEMODE,
  ADAI_V3_DEBT_STABLE,
  ADAI_V3_DEBT_VARIABLE,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
} from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RAaveProtocolV3Debt', function () {
  const stableDebtTokenAddress = ADAI_V3_DEBT_STABLE;
  const variableDebtTokenAddress = ADAI_V3_DEBT_VARIABLE;
  const aaveTokenAddress = AWETH_V3;
  const aaveTokenProviderAddress = AWETH_V3_PROVIDER;
  const quoteAddress = USDC_TOKEN;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let vDebtToken: IVariableDebtTokenV3;
  let sDebtToken: IStableDebtTokenV3;
  let aToken: IATokenV3;
  let aTokenProvider: Signer;
  let borrowToken: IERC20;

  let registry: AssetRegistry;
  let resolver: RAaveProtocolV3Debt;
  let resolverMock: RAaveProtocolV3DebtMock;
  let router: AssetRouter;
  let oracle: Chainlink;

  let pool: IPool;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    aToken = await ethers.getContractAt('IATokenV3', aaveTokenAddress);
    aTokenProvider = await impersonateAndInjectEther(aaveTokenProviderAddress);
    sDebtToken = await ethers.getContractAt('IStableDebtTokenV3', stableDebtTokenAddress);
    vDebtToken = await ethers.getContractAt('IVariableDebtTokenV3', variableDebtTokenAddress);
    borrowToken = await ethers.getContractAt('IERC20', await sDebtToken.UNDERLYING_ASSET_ADDRESS());

    resolver = await (await ethers.getContractFactory('RAaveProtocolV3Debt')).deploy();
    await resolver.deployed();

    resolverMock = await (await ethers.getContractFactory('RAaveProtocolV3DebtMock')).deploy();
    await resolverMock.deployed();

    const canonicalResolver = await (await ethers.getContractFactory('RCanonical')).deploy();
    await canonicalResolver.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();
    await registry.register(vDebtToken.address, resolver.address);
    await registry.register(sDebtToken.address, resolver.address);
    await registry.register(borrowToken.address, canonicalResolver.address);

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();
    await oracle.connect(owner).addAssets([borrowToken.address, quoteAddress], [aggregatorA, aggregatorB]);

    router = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await router.deployed();
    expect(await router.oracle()).to.be.eq(oracle.address);

    const provider = await ethers.getContractAt('IPoolAddressesProvider', AAVEPROTOCOL_V3_PROVIDER);
    pool = await ethers.getContractAt('IPool', await provider.getPool());
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('stable debt', function () {
    beforeEach(async function () {
      // Send AToken to user for borrowing later
      await aToken.connect(aTokenProvider).transfer(user.address, ether('1'));

      // Borrow
      const borrowAmount = ether('1');
      await pool.connect(user).borrow(borrowToken.address, borrowAmount, AAVE_RATEMODE.STABLE, 0, user.address);
      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
    });

    it('normal', async function () {
      const asset = sDebtToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router.connect(user).calcAssetValue(asset, amount, quote);

      const underlyingTokenAddress = await sDebtToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(underlyingTokenAddress, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue.mul(-1));
    });

    it('should revert: resolver asset value positive', async function () {
      const asset = sDebtToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // Change to mock resolver
      await registry.unregister(asset);
      await registry.register(asset, resolverMock.address);

      await expect(router.connect(user).calcAssetValue(asset, amount, quote)).to.be.revertedWith('RevertCode(56)'); // RESOLVER_ASSET_VALUE_POSITIVE
    });
  });

  describe('variable debt ', function () {
    beforeEach(async function () {
      // Send AToken to user for borrowing later
      await aToken.connect(aTokenProvider).transfer(user.address, ether('1'));

      // Borrow
      const borrowAmount = ether('1');
      await pool.connect(user).borrow(borrowToken.address, borrowAmount, AAVE_RATEMODE.VARIABLE, 0, user.address);
      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
    });

    it('normal', async function () {
      const asset = vDebtToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router.connect(user).calcAssetValue(asset, amount, quote);

      const underlyingTokenAddress = await vDebtToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(underlyingTokenAddress, amount, quote);

      // Verify;
      expect(assetValue).to.be.eq(tokenValue.mul(-1));
    });

    it('should revert: resolver asset value positive', async function () {
      const asset = vDebtToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // Change to mock resolver
      await registry.unregister(asset);
      await registry.register(asset, resolverMock.address);

      await expect(router.connect(user).calcAssetValue(asset, amount, quote)).to.be.revertedWith('RevertCode(56)'); // RESOLVER_ASSET_VALUE_POSITIVE
    });
  });
});
