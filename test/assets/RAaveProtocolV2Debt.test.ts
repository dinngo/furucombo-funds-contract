import { constants, Wallet, Signer } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  RAaveProtocolV2Debt,
  IATokenV2,
  ILendingPoolV2,
  IERC20,
} from '../../typechain';

import {
  USDC_TOKEN,
  AWETH_V2,
  AWETH_V2_PROVIDER,
  AAVEPROTOCOL_V2_PROVIDER,
  AAVE_RATEMODE,
  ADAI_V2_DEBT_VARIABLE,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
} from '../utils/constants';

import { ether, impersonateAndInjectEther } from '../utils/utils';

describe('RAaveProtocolV2Debt', function () {
  const variableDebtTokenAddress = ADAI_V2_DEBT_VARIABLE;
  const aaveTokenAddress = AWETH_V2;
  const aaveTokenProviderAddress = AWETH_V2_PROVIDER;
  const quoteAddress = USDC_TOKEN;
  const aggregatorA = CHAINLINK_DAI_USD;
  const aggregatorB = CHAINLINK_USDC_USD;

  let owner: Wallet;
  let user: Wallet;

  let vDebtToken: IATokenV2;
  let aToken: IATokenV2;
  let aTokenProvider: Signer;
  let borrowToken: IERC20;

  let registry: AssetRegistry;
  let resolver: RAaveProtocolV2Debt;
  let router: AssetRouter;
  let oracle: Chainlink;

  let lendingPool: ILendingPoolV2;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      aToken = await ethers.getContractAt('IATokenV2', aaveTokenAddress);
      aTokenProvider = await impersonateAndInjectEther(
        aaveTokenProviderAddress
      );

      vDebtToken = await ethers.getContractAt(
        'IATokenV2',
        variableDebtTokenAddress
      );

      borrowToken = await ethers.getContractAt(
        'IERC20',
        await vDebtToken.UNDERLYING_ASSET_ADDRESS()
      );

      resolver = await (
        await ethers.getContractFactory('RAaveProtocolV2Debt')
      ).deploy();
      await resolver.deployed();

      const canonicalResolver = await (
        await ethers.getContractFactory('RCanonical')
      ).deploy();
      await canonicalResolver.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();
      await registry.register(vDebtToken.address, resolver.address);
      await registry.register(borrowToken.address, canonicalResolver.address);

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();
      await oracle
        .connect(owner)
        .addAssets(
          [borrowToken.address, quoteAddress],
          [aggregatorA, aggregatorB]
        );

      router = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await router.deployed();
      expect(await router.oracle()).to.be.eq(oracle.address);

      const provider = await ethers.getContractAt(
        'ILendingPoolAddressesProviderV2',
        AAVEPROTOCOL_V2_PROVIDER
      );
      lendingPool = await ethers.getContractAt(
        'ILendingPoolV2',
        await provider.getLendingPool()
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('variable debt ', function () {
    beforeEach(async function () {
      // Send AToken to user for borrowing later
      await aToken.connect(aTokenProvider).transfer(user.address, ether('1'));

      const borrowAmount = ether('1');
      await lendingPool
        .connect(user)
        .borrow(
          borrowToken.address,
          borrowAmount,
          AAVE_RATEMODE.VARIABLE,
          0,
          user.address
        );
      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
    });

    it('normal', async function () {
      const asset = vDebtToken.address;
      const amount = ether('1.12');
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, amount, quote);

      const underlyingTokenAddress =
        await vDebtToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(
        underlyingTokenAddress,
        amount,
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(tokenValue.mul(-1));
    });

    it('max amount', async function () {
      const asset = vDebtToken.address;
      const amount = constants.MaxUint256;
      const quote = quoteAddress;

      // get asset value by asset resolver
      const assetValue = await router
        .connect(user)
        .callStatic.calcAssetValue(asset, amount, quote);

      const underlyingTokenAddress =
        await vDebtToken.UNDERLYING_ASSET_ADDRESS();
      const tokenValue = await oracle.calcConversionAmount(
        underlyingTokenAddress,
        await vDebtToken.balanceOf(user.address),
        quote
      );

      // Verify;
      expect(assetValue).to.be.eq(tokenValue.mul(-1));
    });
  });

  // NOTE: Stable Rate borrow is not available yet
});
