import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  MortgageVault,
  Chainlink,
  IERC20,
  Registry,
  FurucomboProxy,
  HAaveProtocolV2,
  HFunds,
  AFurucombo,
  TaskExecutor,
  ComptrollerImplementation,
  PoolProxyFactory,
  PoolImplementation,
  ShareToken,
  IUniswapV2Router02,
} from '../../typechain';

import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  FURUCOMBO_HQUICKSWAP,
  FURUCOMBO_HSUSHISWAP,
  FURUCOMBO_HCURVE,
  DS_PROXY_REGISTRY,
  WL_ANY_SIG,
  QUICKSWAP_ROUTER,
  SUSHISWAP_ROUTER,
  WMATIC_TOKEN,
  QUICKSWAP_USDC_WETH,
  BAT_PROVIDER,
  WETH_PROVIDER,
  USDC_PROVIDER,
  FEE_BASE,
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
  deployComptrollerAndPoolProxyFactory,
  deployContracts,
  createPoolProxy,
  deployAssetResolvers,
  deployMortgageVault,
  deployTaskExecutorAndAFurucombo,
  registerHandlers,
  registerResolvers,
} from './deploy';

describe('PoolExecuteStrategy', function () {
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
  const reserveExecutionRatio = 1000; // 10%
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

  let fRegistry: Registry;
  let furucombo: FurucomboProxy;
  let hAaveV2: HAaveProtocolV2;
  let hFunds: HFunds;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let implementation: PoolImplementation;
  let comptroller: ComptrollerImplementation;
  let poolProxyFactory: PoolProxyFactory;
  let poolProxy: PoolImplementation;
  let poolVault: string;

  let quickRouter: IUniswapV2Router02;
  let sushiRouter: IUniswapV2Router02;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, collector, manager, investor, liquidator] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      // denominationProvider = await tokenProviderSushi(denominationAddress);
      denominationProvider = await impersonateAndInjectEther(
        denominationProviderAddress
      );
      denomination = await ethers.getContractAt('IERC20', denominationAddress);
      mortgage = await ethers.getContractAt('IERC20', mortgageAddress);
      tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
      tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

      // Deploy furucombo funds contracts
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
      [oracle, assetRegistry, assetRouter] =
        await deployAssetOracleAndRouterAndRegistry();
      mortgageVault = await deployMortgageVault(mortgage.address);

      [implementation, comptroller, poolProxyFactory] =
        await deployComptrollerAndPoolProxyFactory(
          DS_PROXY_REGISTRY,
          assetRouter.address,
          collector.address,
          execFeePercentage,
          liquidator.address,
          pendingExpiration,
          mortgageVault.address,
          valueTolerance
        );
      [taskExecutor, aFurucombo] = await deployTaskExecutorAndAFurucombo(
        comptroller,
        owner.address,
        furucombo.address
      );

      // Register furucombo handlers
      [hAaveV2, hFunds] = await deployContracts(
        ['HAaveProtocolV2', 'HFunds'],
        [[], []]
      );
      await registerHandlers(
        fRegistry,
        [
          hFunds.address,
          hAaveV2.address,
          FURUCOMBO_HCURVE,
          FURUCOMBO_HQUICKSWAP,
          FURUCOMBO_HSUSHISWAP,
        ],
        ['HFunds', 'HAaveProtocolV2', 'HCurve', 'HQuickswap', 'HSushiswap']
      );

      // Setup comptroller whitelist
      await comptroller.permitDenominations(
        [denomination.address],
        [BigNumber.from('10')]
      );

      await comptroller.permitCreators([manager.address]);

      await comptroller.permitAssets(level, [
        denominationAddress,
        tokenA.address,
        tokenB.address,
      ]);

      await comptroller.permitDelegateCalls(
        level,
        [aFurucombo.address],
        [WL_ANY_SIG]
      );

      await comptroller.permitHandlers(
        level,
        [
          hAaveV2.address,
          hFunds.address,
          FURUCOMBO_HCURVE,
          FURUCOMBO_HQUICKSWAP,
          FURUCOMBO_HSUSHISWAP,
        ],
        [WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG]
      );

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
        [
          canonicalResolver.address,
          canonicalResolver.address,
          canonicalResolver.address,
        ]
      );

      // Create and finalize furucombo fund
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
      await poolProxy.connect(manager).finalize();
      shareToken = await ethers.getContractAt(
        'ShareToken',
        await poolProxy.shareToken()
      );
      poolVault = await poolProxy.vault();

      // External
      quickRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        QUICKSWAP_ROUTER
      );
      sushiRouter = await ethers.getContractAt(
        'IUniswapV2Router02',
        SUSHISWAP_ROUTER
      );

      // Transfer token to investor
      const initialFunds = mwei('3000');
      await denomination
        .connect(denominationProvider)
        .transfer(investor.address, initialFunds);

      // print log
      console.log('fRegistry', fRegistry.address);
      console.log('furucombo', furucombo.address);
      console.log('oracle', oracle.address);
      console.log('assetRegistry', assetRegistry.address);
      console.log('assetRouter', assetRouter.address);
      console.log('implementation', implementation.address);
      console.log('comptroller', comptroller.address);
      console.log('poolProxyFactory', poolProxyFactory.address);
      console.log('poolProxy', poolProxy.address);
      console.log('taskExecutor', taskExecutor.address);
      console.log('aFurucombo', aFurucombo.address);
    }
  );
  beforeEach(async function () {
    await setupTest();
  });

  describe('execute strategy in operation', function () {
    const purchaseAmount = mwei('2000');
    let ownedShares: BigNumber;
    let tokenAPoolVaultBalance: BigNumber;
    let tokenBPoolVaultBalance: BigNumber;
    let denominationProxyBalance: BigNumber;
    let denominationCollectorBalance: BigNumber;

    beforeEach(async function () {
      // Deposit denomination to get shares
      await denomination
        .connect(investor)
        .approve(poolProxy.address, purchaseAmount);
      await poolProxy.connect(investor).purchase(purchaseAmount);
      ownedShares = await shareToken.balanceOf(investor.address);

      tokenAPoolVaultBalance = await tokenA.balanceOf(poolVault);
      tokenBPoolVaultBalance = await tokenB.balanceOf(poolVault);
      denominationProxyBalance = await denomination.balanceOf(poolVault);
      denominationCollectorBalance = await denomination.balanceOf(
        collector.address
      );
    });

    it('quickswap', async function () {
      // Prepare action data
      const amountIn = mwei('1000');
      const actionAmountIn = amountIn
        .mul(BigNumber.from(FEE_BASE).sub(execFeePercentage))
        .div(FEE_BASE);
      const tokensIn = [denomination.address];
      const amountsIn = [amountIn];
      const tokensOut = [tokenA.address];
      const path = [denomination.address, tokenB.address, tokenA.address];
      const tos = [hFunds.address, FURUCOMBO_HQUICKSWAP];
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
      await poolProxy.connect(manager).execute(data);

      // Verify
      // check shares are the same
      expect(ownedShares).to.be.eq(
        await shareToken.balanceOf(investor.address)
      );

      // check denomination will decrease and token will increase
      expect(await tokenA.balanceOf(poolVault)).to.be.eq(
        tokenAPoolVaultBalance.add(amountOut)
      );
      expect(await denomination.balanceOf(poolVault)).to.be.eq(
        denominationProxyBalance.sub(amountIn)
      );

      // check collector will get execute fee
      expect(
        (await denomination.balanceOf(collector.address)).sub(
          denominationCollectorBalance
        )
      ).to.be.eq(amountIn.mul(execFeePercentage).div(FEE_BASE));

      // TODO: check it after refine quickswap handler
      // check asset list will be updated
      // const assetList = await poolProxy.getAssetList();
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
        .mul(BigNumber.from(FEE_BASE).sub(execFeePercentage))
        .div(FEE_BASE);
      const tokensIn = [denomination.address];
      const amountsIn = [amountIn];
      const tokensOut = [tokenA.address];
      const path = [denomination.address, tokenB.address, tokenA.address];
      const tos = [hFunds.address, FURUCOMBO_HSUSHISWAP];
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
      await poolProxy.connect(manager).execute(data);

      // Verify
      // check shares are the same
      expect(ownedShares).to.be.eq(
        await shareToken.balanceOf(investor.address)
      );

      // check denomination will decrease and token will increase
      expect(await tokenA.balanceOf(poolVault)).to.be.eq(
        tokenAPoolVaultBalance.add(amountOut)
      );
      expect(await denomination.balanceOf(poolVault)).to.be.eq(
        denominationProxyBalance.sub(amountIn)
      );

      // check collector will get execute fee
      expect(
        (await denomination.balanceOf(collector.address)).sub(
          denominationCollectorBalance
        )
      ).to.be.eq(amountIn.mul(execFeePercentage).div(FEE_BASE));

      // TODO: check it after refine sushiswap handler
      // check asset list will be updated
      // const assetList = await poolProxy.getAssetList();
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
