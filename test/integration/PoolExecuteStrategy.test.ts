import { constants, Wallet, Signer, BigNumber } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  AssetRegistry,
  AssetRouter,
  Chainlink,
  IERC20,
  Registry,
  FurucomboProxy,
  HAaveProtocolV2,
  HFunds,
  AFurucombo,
  TaskExecutor,
  Comptroller,
  PoolProxyFactory,
  Implementation,
  ShareToken,
} from '../../typechain';

import {
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
} from '../utils/constants';

import {
  szabo,
  asciiToHex32,
  tokenProviderQuick,
  simpleEncode,
  getCallData,
} from '../utils/utils';

import {
  deployFurucomboProxyAndRegistry,
  deployAssetOracleAndRouterAndRegistry,
  deployComptrollerAndPoolProxyFactory,
  deployContracts,
  createPoolProxy,
  deployAssetResolvers,
  deployTaskExecutorAndAFurucombo,
  registerHandlers,
  registerResolvers,
} from './deploy';

describe('PoolExecuteStrategy', function () {
  const denominationAddress = USDC_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mFeeRate = 10;
  const pFeeRate = 10;
  const execFeePercentage = 200; // 20%
  const crystallizationPeriod = 300; // 5m
  const reserveExecution = szabo('10'); // 10USDC

  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;

  let denomination: IERC20;
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
  let implementation: Implementation;
  let comptroller: Comptroller;
  let poolProxyFactory: PoolProxyFactory;
  let poolProxy: Implementation;
  let poolVault: string;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, collector, manager, investor] = await (
        ethers as any
      ).getSigners();

      // Setup tokens and providers
      denominationProvider = await tokenProviderQuick(denominationAddress);
      denomination = await ethers.getContractAt('IERC20', denominationAddress);
      tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
      tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

      // Deploy furucombo funds contracts
      [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();
      [oracle, assetRegistry, assetRouter] =
        await deployAssetOracleAndRouterAndRegistry();
      [implementation, comptroller, poolProxyFactory] =
        await deployComptrollerAndPoolProxyFactory(
          DS_PROXY_REGISTRY,
          assetRouter.address,
          collector.address,
          execFeePercentage
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
      await comptroller.permitAssets(level, [
        denominationAddress,
        tokenA.address,
        tokenB.address,
      ]);
      comptroller.permitDelegateCalls(
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
        reserveExecution
      );
      await poolProxy.connect(manager).finalize();
      shareToken = await ethers.getContractAt(
        'ShareToken',
        await poolProxy.shareToken()
      );
      poolVault = await poolProxy.vault();

      // Transfer token to investor
      const initialFunds = szabo('1000');
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

  describe('execute strategy in operation: quickSwap', function () {
    const purchaseAmount = szabo('100');
    let ownedShares: BigNumber;
    beforeEach(async function () {
      // TODO: Deposit denomination to get shares
      await denomination
        .connect(investor)
        .approve(poolProxy.address, purchaseAmount);
      await poolProxy.connect(investor).purchase(purchaseAmount);
      ownedShares = await shareToken.balanceOf(investor.address);
    });

    it('normal', async function () {
      const tokenAProxyBalance = await tokenA.balanceOf(poolVault);
      const denominationProxyBalance = await denomination.balanceOf(poolVault);
      const denominationCollectorBalance = await denomination.balanceOf(
        collector.address
      );

      // Prepare action data
      const amountIn = szabo('10');
      const base = await taskExecutor.FEE_BASE();
      const actionAmountIn = amountIn
        .mul(base.sub(execFeePercentage))
        .div(base);
      const tokensIn = [denomination.address];
      const amountsIn = [amountIn];
      const tokensOut = [tokenA.address];
      const tos = [hFunds.address, FURUCOMBO_HQUICKSWAP];
      const configs = [constants.HashZero, constants.HashZero];
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          actionAmountIn, // amountIn
          1, // amountOutMin
          [denomination.address, tokenA.address], // path
        ]),
      ];
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

      // Execute strategy
      await poolProxy.connect(manager).execute(data);

      // Verify
      const tokenAProxyBalanceAfter = await tokenA.balanceOf(
        await poolProxy.vault()
      );
      const denominationProxyBalanceAfter = await denomination.balanceOf(
        poolVault
      );
      const denominationCollectorBalanceAfter = await denomination.balanceOf(
        collector.address
      );

      const expectExecuteFee = amountIn.mul(execFeePercentage).div(base);
      expect(tokenAProxyBalanceAfter).to.be.gt(tokenAProxyBalance);
      expect(denominationProxyBalanceAfter).to.be.lt(denominationProxyBalance);
      expect(
        denominationCollectorBalanceAfter.sub(denominationCollectorBalance)
      ).to.be.eq(expectExecuteFee);
      expect(ownedShares).to.be.eq(
        await shareToken.balanceOf(investor.address)
      );

      const assetList = await poolProxy.getAssetList();
      console.log('assetList', assetList);

      // TODO: manager execute strategy
    });
  });
});
