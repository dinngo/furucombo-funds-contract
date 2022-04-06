import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  MortgageVault,
  Chainlink,
  IERC20,
  FurucomboRegistry,
  FurucomboProxy,
  HAaveProtocolV2,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ComptrollerImplementation,
  FundProxyFactory,
  FundImplementation,
  ShareToken,
  IUniswapV2Router02,
  HQuickSwap,
  HSushiSwap,
} from '../../typechain';

import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  DS_PROXY_REGISTRY,
  WL_ANY_SIG,
  QUICKSWAP_ROUTER,
  SUSHISWAP_ROUTER,
  WMATIC_TOKEN,
  QUICKSWAP_USDC_WETH,
  BAT_PROVIDER,
  WETH_PROVIDER,
  USDC_PROVIDER,
  FUND_PERCENTAGE_BASE,
} from '../utils/constants';

import {
  mwei,
  ether,
  asciiToHex32,
  tokenProviderSushi,
  simpleEncode,
  getCallData,
  impersonateAndInjectEther,
} from '../utils/utils';

import {
  deployFurucomboProxyAndRegistry,
  deployAssetOracleAndRouterAndRegistry,
  deployComptrollerAndFundProxyFactory,
  deployContracts,
  createFundProxy,
  deployAssetResolvers,
  deployMortgageVault,
  deployTaskExecutorAndAFurucombo,
  registerHandlers,
  registerResolvers,
} from './deploy';
import { HCurve } from '../../typechain/HCurve';

describe('FundExecuteStrategy', function () {
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;
  const denominationProviderAddress = USDC_PROVIDER;
  const mortgageProviderAddress = BAT_PROVIDER;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mFeeRate = 10;
  const pFeeRate = 10;
  const execFeePercentage = 200; // 20%
  const valueTolerance = 9000; // 90%
  const pendingExpiration = 86400; // 1 day
  const crystallizationPeriod = 300; // 5m
  const reserveExecutionRate = 1000; // 10%
  const shareTokenName = 'TEST';

  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;

  let denomination: IERC20;
  let mortgage: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let shareToken: ShareToken;
  let denominationProvider: Signer;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hAaveV2: HAaveProtocolV2;
  let hCurve: HCurve;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let implementation: FundImplementation;
  let comptroller: ComptrollerImplementation;
  let fundProxyFactory: FundProxyFactory;
  let fundProxy: FundImplementation;
  let fundVault: string;

  let quickRouter: IUniswapV2Router02;
  let sushiRouter: IUniswapV2Router02;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    // denominationProvider = await tokenProviderSushi(denominationAddress);
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);
    denomination = await ethers.getContractAt('IERC20', denominationAddress);
    mortgage = await ethers.getContractAt('IERC20', mortgageAddress);
    tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
    tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

    // Deploy furucombo funds contracts
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
    [oracle, assetRegistry, assetRouter] = await deployAssetOracleAndRouterAndRegistry();
    mortgageVault = await deployMortgageVault(mortgage.address);

    [implementation, comptroller, fundProxyFactory] = await deployComptrollerAndFundProxyFactory(
      DS_PROXY_REGISTRY,
      assetRouter.address,
      collector.address,
      execFeePercentage,
      liquidator.address,
      pendingExpiration,
      mortgageVault.address,
      valueTolerance
    );
    [taskExecutor, aFurucombo] = await deployTaskExecutorAndAFurucombo(comptroller, owner.address, furucombo.address);

    // Register furucombo handlers
    [hAaveV2, hFunds, hCurve, hQuickSwap, hSushiSwap] = await deployContracts(
      ['HAaveProtocolV2', 'HFunds', 'HCurve', 'HQuickSwap', 'HSushiSwap'],
      [[], [], [], [], []]
    );
    await registerHandlers(
      fRegistry,
      [hFunds.address, hAaveV2.address, hCurve.address, hQuickSwap.address, hSushiSwap.address],
      ['HFunds', 'HAaveProtocolV2', 'HCurve', 'HQuickswap', 'HSushiswap']
    );

    // Setup comptroller whitelist
    await comptroller.permitDenominations([denomination.address], [BigNumber.from('10')]);

    await comptroller.permitCreators([manager.address]);

    await comptroller.permitAssets(level, [denominationAddress, tokenA.address, tokenB.address]);

    await comptroller.permitDelegateCalls(level, [aFurucombo.address], [WL_ANY_SIG]);

    await comptroller.permitHandlers(
      level,
      [hAaveV2.address, hFunds.address, hCurve.address, hQuickSwap.address, hSushiSwap.address],
      [WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG]
    );

    await comptroller.setMortgageTier(level, 0);

    // Add Assets to oracle
    await oracle
      .connect(owner)
      .addAssets(
        [denominationAddress, tokenAAddress, tokenBAddress],
        [denominationAggregator, tokenAAggregator, tokenBAggregator]
      );

    // Register resolvers
    const [canonicalResolver] = await deployContracts(['RCanonical'], [[]]);
    await registerResolvers(
      assetRegistry,
      [denomination.address, tokenA.address, tokenB.address],
      [canonicalResolver.address, canonicalResolver.address, canonicalResolver.address]
    );

    // Create and finalize furucombo fund
    fundProxy = await createFundProxy(
      fundProxyFactory,
      manager,
      denominationAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecutionRate,
      shareTokenName
    );
    await fundProxy.connect(manager).finalize();
    shareToken = await ethers.getContractAt('ShareToken', await fundProxy.shareToken());
    fundVault = await fundProxy.vault();

    // External
    quickRouter = await ethers.getContractAt('IUniswapV2Router02', QUICKSWAP_ROUTER);
    sushiRouter = await ethers.getContractAt('IUniswapV2Router02', SUSHISWAP_ROUTER);

    // Transfer token to investor
    const initialFunds = mwei('3000');
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);

    // print log
    console.log('fRegistry', fRegistry.address);
    console.log('furucombo', furucombo.address);
    console.log('oracle', oracle.address);
    console.log('assetRegistry', assetRegistry.address);
    console.log('assetRouter', assetRouter.address);
    console.log('implementation', implementation.address);
    console.log('comptroller', comptroller.address);
    console.log('fundProxyFactory', fundProxyFactory.address);
    console.log('fundProxy', fundProxy.address);
    console.log('taskExecutor', taskExecutor.address);
    console.log('aFurucombo', aFurucombo.address);
  });
  beforeEach(async function () {
    await setupTest();
  });

  describe('execute strategy in operation', function () {
    const purchaseAmount = mwei('2000');
    let ownedShare: BigNumber;
    let tokenAFundVaultBalance: BigNumber;
    let tokenBFundVaultBalance: BigNumber;
    let denominationProxyBalance: BigNumber;
    let denominationCollectorBalance: BigNumber;

    beforeEach(async function () {
      // Deposit denomination to get share
      await denomination.connect(investor).approve(fundProxy.address, purchaseAmount);
      await fundProxy.connect(investor).purchase(purchaseAmount);
      ownedShare = await shareToken.balanceOf(investor.address);

      tokenAFundVaultBalance = await tokenA.balanceOf(fundVault);
      tokenBFundVaultBalance = await tokenB.balanceOf(fundVault);
      denominationProxyBalance = await denomination.balanceOf(fundVault);
      denominationCollectorBalance = await denomination.balanceOf(collector.address);
    });

    it('quickswap', async function () {
      // Prepare action data
      const amountIn = mwei('1000');
      const actionAmountIn = amountIn
        .mul(BigNumber.from(FUND_PERCENTAGE_BASE).sub(execFeePercentage))
        .div(FUND_PERCENTAGE_BASE);
      const tokensIn = [denomination.address];
      const amountsIn = [amountIn];
      const tokensOut = [tokenA.address];
      const path = [denomination.address, tokenB.address, tokenA.address];
      const tos = [hFunds.address, hQuickSwap.address];
      const configs = [constants.HashZero, constants.HashZero];

      // Furucombo data
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          actionAmountIn, // amountIn
          1, // amountOutMin
          path,
        ]),
      ];

      // Action data
      const actionData = getCallData(aFurucombo, 'injectAndBatchExec', [
        tokensIn,
        [actionAmountIn],
        tokensOut,
        tos,
        configs,
        datas,
      ]);

      // TaskExecutor data
      const data = getCallData(taskExecutor, 'batchExec', [
        tokensIn,
        amountsIn,
        [aFurucombo.address],
        [constants.HashZero],
        [actionData],
      ]);

      // Get expect amount out
      const amountOuts = await quickRouter.getAmountsOut(actionAmountIn, path);
      const amountOut = amountOuts[amountOuts.length - 1];

      // Execute strategy
      await fundProxy.connect(manager).execute(data);

      // Verify
      // check share are the same
      expect(ownedShare).to.be.eq(await shareToken.balanceOf(investor.address));

      // check denomination will decrease and token will increase
      expect(await tokenA.balanceOf(fundVault)).to.be.eq(tokenAFundVaultBalance.add(amountOut));
      expect(await denomination.balanceOf(fundVault)).to.be.eq(denominationProxyBalance.sub(amountIn));

      // check collector will get execute fee
      expect((await denomination.balanceOf(collector.address)).sub(denominationCollectorBalance)).to.be.eq(
        amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE)
      );

      // TODO: check it after refine quickswap handler
      // check asset list will be updated
      // const assetList = await fundProxy.getAssetList();
      // const expectedAssets = [denomination.address].concat(
      //   path.slice(1, path.length)
      // );

      // expect(assetList.length).to.be.eq(expectedAssets.length);
      // for (let i = 0; i < assetList.length; ++i) {
      //   expect(assetList[i]).to.be.eq(expectedAssets[i]);
      // }
    });

    it('sushiswap', async function () {
      // Prepare action data
      const amountIn = mwei('1000');
      const actionAmountIn = amountIn
        .mul(BigNumber.from(FUND_PERCENTAGE_BASE).sub(execFeePercentage))
        .div(FUND_PERCENTAGE_BASE);
      const tokensIn = [denomination.address];
      const amountsIn = [amountIn];
      const tokensOut = [tokenA.address];
      const path = [denomination.address, tokenB.address, tokenA.address];
      const tos = [hFunds.address, hSushiSwap.address];
      const configs = [constants.HashZero, constants.HashZero];

      // Furucombo data
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          actionAmountIn, // amountIn
          1, // amountOutMin
          path,
        ]),
      ];

      // Action data
      const actionData = getCallData(aFurucombo, 'injectAndBatchExec', [
        tokensIn,
        [actionAmountIn],
        tokensOut,
        tos,
        configs,
        datas,
      ]);

      // TaskExecutor data
      const data = getCallData(taskExecutor, 'batchExec', [
        tokensIn,
        amountsIn,
        [aFurucombo.address],
        [constants.HashZero],
        [actionData],
      ]);

      // Get expect amount out
      const amountOuts = await sushiRouter.getAmountsOut(actionAmountIn, path);
      const amountOut = amountOuts[amountOuts.length - 1];

      // Execute strategy
      await fundProxy.connect(manager).execute(data);

      // Verify
      // check share are the same
      expect(ownedShare).to.be.eq(await shareToken.balanceOf(investor.address));

      // check denomination will decrease and token will increase
      expect(await tokenA.balanceOf(fundVault)).to.be.eq(tokenAFundVaultBalance.add(amountOut));
      expect(await denomination.balanceOf(fundVault)).to.be.eq(denominationProxyBalance.sub(amountIn));

      // check collector will get execute fee
      expect((await denomination.balanceOf(collector.address)).sub(denominationCollectorBalance)).to.be.eq(
        amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE)
      );

      // TODO: check it after refine sushiswap handler
      // check asset list will be updated
      // const assetList = await fundProxy.getAssetList();
      // const expectedAssets = [denomination.address].concat(
      //   path.slice(1, path.length)
      // );

      // expect(assetList.length).to.be.eq(expectedAssets.length);
      // for (let i = 0; i < assetList.length; ++i) {
      //   expect(assetList[i]).to.be.eq(expectedAssets[i]);
      // }
    });
  });
});
