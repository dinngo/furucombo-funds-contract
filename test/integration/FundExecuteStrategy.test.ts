import { Wallet, Signer, BigNumber, constants } from 'ethers';
import { expect } from 'chai';
import { deployments, ethers } from 'hardhat';
import {
  IERC20,
  FurucomboRegistry,
  FurucomboProxy,
  HFunds,
  AFurucombo,
  TaskExecutor,
  FundImplementation,
  ShareToken,
  IUniswapV2Router02,
  HQuickSwap,
  HSushiSwap,
  ComptrollerImplementation,
  IUniswapV2Factory,
  ICurveHandler,
  HCurve,
  HAaveProtocolV2,
  ILendingPoolV2,
  AssetRouter,
  AssetRegistry,
  RAaveProtocolV2Debt,
  RAaveProtocolV2Asset,
  RCanonical,
} from '../../typechain';

import {
  BAT_TOKEN,
  USDC_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  USDT_TOKEN,
  CHAINLINK_DAI_USD,
  CHAINLINK_USDC_USD,
  CHAINLINK_ETH_USD,
  QUICKSWAP_ROUTER,
  SUSHISWAP_ROUTER,
  USDC_PROVIDER,
  FUND_PERCENTAGE_BASE,
  FUND_STATE,
  ONE_DAY,
  LINK_TOKEN,
  CURVE_AAVE_SWAP,
  CURVE_AAVECRV,
  CURVE_ATRICRYPTO3_DEPOSIT,
  WL_ANY_SIG,
  AAVEPROTOCOL_V2_PROVIDER,
  AAVE_RATEMODE,
  CURVE_ATRICRYPTO3,
  WBTC_TOKEN,
  CURVE_ATRICRYPTO3_PROVIDER,
} from '../utils/constants';

import {
  mwei,
  ether,
  simpleEncode,
  impersonateAndInjectEther,
  getCallData,
  asciiToHex32,
  decimal6To18,
  decimal18To6,
  padRightZero,
  tokenProviderSushi,
} from '../utils/utils';

import { createFund, execSwap, purchaseFund, getSwapData, redeemFund } from './fund';
import { deployFurucomboProxyAndRegistry } from './deploy';

describe('FundExecuteStrategy', function () {
  const denominationAddress = USDC_TOKEN;
  const mortgageAddress = BAT_TOKEN;
  const tokenAAddress = DAI_TOKEN;
  const tokenBAddress = WETH_TOKEN;
  const denominationProviderAddress = USDC_PROVIDER;

  const denominationAggregator = CHAINLINK_USDC_USD;
  const tokenAAggregator = CHAINLINK_DAI_USD;
  const tokenBAggregator = CHAINLINK_ETH_USD;

  const level = 1;
  const mortgageAmount = 0;
  const mFeeRate = 0;
  const pFeeRate = 0;
  const execFeePercentage = FUND_PERCENTAGE_BASE * 0.02; // 0.2%
  const valueTolerance = FUND_PERCENTAGE_BASE * 0.9; // 90%
  const pendingExpiration = ONE_DAY; // 1 day
  const crystallizationPeriod = 300; // 5m
  const shareTokenName = 'TEST';

  const initialFunds = mwei('3000');
  const purchaseAmount = mwei('2000');
  let purchasedShare: BigNumber;

  let owner: Wallet;
  let collector: Wallet;
  let manager: Wallet;
  let investor: Wallet;
  let liquidator: Wallet;

  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let shareToken: ShareToken;
  let denominationProvider: Signer;

  let fRegistry: FurucomboRegistry;
  let furucombo: FurucomboProxy;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;
  let hFunds: HFunds;
  let hCurve: HCurve;
  let hAaveV2: HAaveProtocolV2;

  let assetRouter: AssetRouter;
  let assetRegistry: AssetRegistry;
  let aaveDebtResolver: RAaveProtocolV2Debt;
  let aaveAssetResolver: RAaveProtocolV2Asset;
  let canonicalResolver: RCanonical;

  let fundProxy: FundImplementation;
  let fundVault: string;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let comptrollerProxy: ComptrollerImplementation;

  let quickRouter: IUniswapV2Router02;
  let sushiRouter: IUniswapV2Router02;
  let quickFactory: IUniswapV2Factory;
  let sushiFactory: IUniswapV2Factory;
  let aaveSwap: ICurveHandler;
  let atricrypto3Swap: ICurveHandler;
  let aaveLendingPool: ILendingPoolV2;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, collector, manager, investor, liquidator] = await (ethers as any).getSigners();

    // Setup tokens and providers
    denominationProvider = await impersonateAndInjectEther(denominationProviderAddress);

    // Deploy furucombo
    [fRegistry, furucombo] = await deployFurucomboProxyAndRegistry();

    // Deploy furucombo funds contracts
    [
      fundProxy,
      fundVault,
      denomination,
      shareToken,
      taskExecutor,
      aFurucombo,
      hFunds,
      tokenA,
      tokenB,
      ,
      comptrollerProxy,
      assetRouter,
      hQuickSwap,
      hSushiSwap,
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
      shareTokenName,
      fRegistry,
      furucombo
    );

    // register handlers
    hCurve = await (await ethers.getContractFactory('HCurve')).deploy();
    await hCurve.deployed();
    hAaveV2 = await (await ethers.getContractFactory('HAaveProtocolV2')).deploy();
    await hAaveV2.deployed();
    await fRegistry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));
    await fRegistry.register(hCurve.address, asciiToHex32('HCurve'));
    await comptrollerProxy.permitHandlers(level, [hCurve.address, hAaveV2.address], [WL_ANY_SIG, WL_ANY_SIG]);

    // resolvers
    aaveDebtResolver = await (await ethers.getContractFactory('RAaveProtocolV2Debt')).deploy();
    await aaveDebtResolver.deployed();
    aaveAssetResolver = await (await ethers.getContractFactory('RAaveProtocolV2Asset')).deploy();
    await aaveAssetResolver.deployed();
    canonicalResolver = await (await ethers.getContractFactory('RCanonical')).deploy();
    await canonicalResolver.deployed();
    assetRegistry = await ethers.getContractAt('AssetRegistry', await assetRouter.registry());

    // External
    quickRouter = await ethers.getContractAt('IUniswapV2Router02', QUICKSWAP_ROUTER);
    quickFactory = await ethers.getContractAt('IUniswapV2Factory', await quickRouter.factory());
    sushiRouter = await ethers.getContractAt('IUniswapV2Router02', SUSHISWAP_ROUTER);
    sushiFactory = await ethers.getContractAt('IUniswapV2Factory', await sushiRouter.factory());
    aaveSwap = await ethers.getContractAt('ICurveHandler', CURVE_AAVE_SWAP);
    atricrypto3Swap = await ethers.getContractAt('ICurveHandler', CURVE_ATRICRYPTO3_DEPOSIT);
    const aaveProvider = await ethers.getContractAt('ILendingPoolAddressesProviderV2', AAVEPROTOCOL_V2_PROVIDER);
    aaveLendingPool = await ethers.getContractAt('ILendingPoolV2', await aaveProvider.getLendingPool());

    // Register HCurve whitelist
    await fRegistry.registerHandlerCalleeWhitelist(hCurve.address, aaveSwap.address);
    await fRegistry.registerHandlerCalleeWhitelist(hCurve.address, atricrypto3Swap.address);

    // Register aave lending pool as valid caller
    await fRegistry.registerCaller(aaveLendingPool.address, padRightZero(hAaveV2.address, 24));

    // Transfer token to investor and purchase
    await denomination.connect(denominationProvider).transfer(investor.address, initialFunds);
    [purchasedShare] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  });
  beforeEach(async function () {
    await setupTest();
  });

  describe('execute strategy', function () {
    describe('Handlers', function () {
      it('quickswap', async function () {
        // Strategy Step:
        // 1. quickswap swap fix input
        // 2. quickswap add liquidity
        // 3. quickswap remove liquidity
        // 4. quickswap swap fix output

        // Prepare action data
        const inputToken = denomination;
        const outputTokenA = tokenB;
        const outputTokenB = tokenA;
        const tokensIn = [inputToken.address];
        const amountIn = purchaseAmount;
        const amountsIn = [amountIn];
        const tokensOut = [outputTokenA.address];
        const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
        const actionAmountIn = amountIn.sub(executionFee);
        const swapFixAmountIn = actionAmountIn.div(2);
        const swapFixInputPath = [inputToken.address, outputTokenA.address];
        const swapFixAmountOut = ether('10');
        const swapFixOutputPath = [inputToken.address, outputTokenB.address];

        // Permit dealing token
        const lpTokenAddress = await quickFactory.getPair(inputToken.address, outputTokenA.address);
        await comptrollerProxy.permitAssets(level, [lpTokenAddress]);

        // Furucombo data
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
            swapFixAmountIn,
            BigNumber.from('1'),
            swapFixInputPath,
          ]),
          simpleEncode('addLiquidity(address,address,uint256,uint256,uint256,uint256)', [
            inputToken.address,
            outputTokenA.address,
            constants.MaxUint256, // Get all balance in furucombo proxy
            constants.MaxUint256, // Get all balance in furucombo proxy
            BigNumber.from('1'),
            BigNumber.from('1'),
          ]),
          simpleEncode('removeLiquidity(address,address,uint256,uint256,uint256)', [
            inputToken.address,
            outputTokenA.address,
            constants.MaxUint256, // Get all balance in furucombo proxy
            BigNumber.from('1'),
            BigNumber.from('1'),
          ]),
          simpleEncode('swapTokensForExactTokens(uint256,uint256,address[])', [
            swapFixAmountOut,
            constants.MaxUint256, // Get all balance in furucombo proxy
            swapFixOutputPath,
          ]),
        ];

        const configs = [
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
        ];
        const tos = [hFunds.address, hQuickSwap.address, hQuickSwap.address, hQuickSwap.address, hQuickSwap.address];

        // Generate execution data
        const data = genVaultExecData(
          aFurucombo,
          taskExecutor,
          tokensIn,
          amountsIn,
          [actionAmountIn],
          tokensOut,
          tos,
          configs,
          datas
        );

        // Get information before execution
        const shareBefore = await shareToken.balanceOf(investor.address);
        const collectorBalanceBefore = await denomination.balanceOf(collector.address);
        const reserveBefore = await fundProxy.getReserve();
        const outputTokenABefore = await outputTokenA.balanceOf(fundVault);
        const assetListBefore = await fundProxy.getAssetList();
        const assetValueBefore = await fundProxy.getGrossAssetValue();
        expect(assetListBefore.length).to.be.eq(1); // denomination only
        expect(assetListBefore[0]).to.be.eq(denomination.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // Execute strategy
        await fundProxy.connect(manager).execute(data);

        // ---- Verify ---- //
        // check share amount
        expect(await shareToken.balanceOf(investor.address)).to.be.eq(shareBefore);

        // check asset list
        const expectedAssetList = [inputToken.address, outputTokenA.address, outputTokenB.address];
        await verifyAssetList(fundProxy, expectedAssetList);

        // check asset value
        const grossAssetValue = await fundProxy.getGrossAssetValue();
        expect(grossAssetValue).to.be.lt(assetValueBefore);
        await verifyAssetValue(fundVault, assetRouter, expectedAssetList, grossAssetValue, denomination.address);

        // check execution fee
        expect((await denomination.balanceOf(collector.address)).sub(collectorBalanceBefore)).to.be.eq(executionFee);

        // check reserve
        expect(await fundProxy.getReserve()).to.be.lt(reserveBefore);

        // check state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // checkout output token
        expect(await outputTokenA.balanceOf(fundVault)).to.be.gt(outputTokenABefore);
        expect(await outputTokenB.balanceOf(fundVault)).to.be.eq(swapFixAmountOut);
      });

      it('sushiswap', async function () {
        // Strategy Step:
        // 1. sushiswap swap fix input
        // 2. sushiswap add liquidity
        // 3. sushiswap remove liquidity
        // 4. sushiswap swap fix output

        // Prepare action data
        const inputToken = denomination;
        const outputTokenA = tokenB;
        const outputTokenB = tokenA;
        const tokensIn = [inputToken.address];
        const amountIn = purchaseAmount;
        const amountsIn = [amountIn];
        const tokensOut = [outputTokenA.address];
        const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
        const actionAmountIn = amountIn.sub(executionFee);
        const swapFixAmountIn = actionAmountIn.div(2);
        const swapFixInputPath = [inputToken.address, outputTokenA.address];
        const swapFixAmountOut = ether('10');
        const swapFixOutputPath = [inputToken.address, outputTokenB.address];

        // Permit dealing token
        const lpTokenAddress = await sushiFactory.callStatic.getPair(inputToken.address, outputTokenA.address);
        await comptrollerProxy.permitAssets(level, [lpTokenAddress]);

        // Furucombo data
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
            swapFixAmountIn,
            BigNumber.from('1'), // amountOutMin
            swapFixInputPath,
          ]),
          simpleEncode('addLiquidity(address,address,uint256,uint256,uint256,uint256)', [
            inputToken.address,
            outputTokenA.address,
            constants.MaxUint256, // Get all balance in furucombo proxy
            constants.MaxUint256, // Get all balance in furucombo proxy
            BigNumber.from('1'),
            BigNumber.from('1'),
          ]),
          simpleEncode('removeLiquidity(address,address,uint256,uint256,uint256)', [
            inputToken.address,
            outputTokenA.address,
            constants.MaxUint256, // Get all balance in furucombo proxy
            BigNumber.from('1'),
            BigNumber.from('1'),
          ]),
          simpleEncode('swapTokensForExactTokens(uint256,uint256,address[])', [
            swapFixAmountOut,
            constants.MaxUint256, // Get all balance in furucombo proxy
            swapFixOutputPath,
          ]),
        ];
        const configs = [
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
        ];
        const tos = [hFunds.address, hSushiSwap.address, hSushiSwap.address, hSushiSwap.address, hSushiSwap.address];

        // Generate execution data
        const data = genVaultExecData(
          aFurucombo,
          taskExecutor,
          tokensIn,
          amountsIn,
          [actionAmountIn],
          tokensOut,
          tos,
          configs,
          datas
        );

        // Get information before execution
        const shareBefore = await shareToken.balanceOf(investor.address);
        const collectorBalanceBefore = await denomination.balanceOf(collector.address);
        const reserveBefore = await fundProxy.getReserve();
        const outputTokenABefore = await outputTokenA.balanceOf(fundVault);
        const assetListBefore = await fundProxy.getAssetList();
        const assetValueBefore = await fundProxy.getGrossAssetValue();
        expect(assetListBefore.length).to.be.eq(1); // denomination only
        expect(assetListBefore[0]).to.be.eq(denomination.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // Execute strategy
        await fundProxy.connect(manager).execute(data);

        // ---- Verify ---- //
        // check share amount
        expect(await shareToken.balanceOf(investor.address)).to.be.eq(shareBefore);

        // check asset list
        const expectedAssetList = [inputToken.address, outputTokenA.address, outputTokenB.address];
        await verifyAssetList(fundProxy, expectedAssetList);

        // check asset value
        const grossAssetValue = await fundProxy.getGrossAssetValue();
        expect(grossAssetValue).to.be.lt(assetValueBefore);
        await verifyAssetValue(fundVault, assetRouter, expectedAssetList, grossAssetValue, denomination.address);

        // check execution fee
        expect((await denomination.balanceOf(collector.address)).sub(collectorBalanceBefore)).to.be.eq(executionFee);

        // check reserve
        expect(await fundProxy.getReserve()).to.be.lt(reserveBefore);

        // check state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // checkout output token
        expect(await outputTokenA.balanceOf(fundVault)).to.be.gt(outputTokenABefore);
        expect(await outputTokenB.balanceOf(fundVault)).to.be.eq(swapFixAmountOut);
      });

      it('curve', async function () {
        // Strategy Step:
        // 1. curve exchange token
        // 2. curve add liquidity
        // 3. curve remove liquidity

        // Prepare action data
        const inputToken = denomination;
        const outputToken = tokenA;
        const poolTokenAddress = CURVE_AAVECRV;
        const tokensIn = [inputToken.address];
        const amountIn = purchaseAmount;
        const amountsIn = [amountIn];
        const tokensOut = [outputToken.address];
        const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
        const actionAmountIn = amountIn.sub(executionFee);
        const value = purchaseAmount.div(2);
        const tokens = [outputToken.address, inputToken.address, USDT_TOKEN];
        const amounts = [constants.MaxUint256, constants.MaxUint256, constants.MaxUint256];

        // Permit dealing token
        await comptrollerProxy.permitAssets(level, [poolTokenAddress]);

        // Furucombo data
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('exchangeUnderlying(address,address,address,int128,int128,uint256,uint256)', [
            aaveSwap.address,
            inputToken.address,
            outputToken.address,
            1, // USDC index
            0, // DAI index
            value,
            BigNumber.from('1'),
          ]),
          simpleEncode('addLiquidityUnderlying(address,address,address[],uint256[],uint256)', [
            aaveSwap.address,
            poolTokenAddress,
            tokens,
            amounts,
            BigNumber.from('1'),
          ]),
          simpleEncode('removeLiquidityOneCoinUnderlying(address,address,address,uint256,int128,uint256)', [
            aaveSwap.address,
            poolTokenAddress,
            outputToken.address,
            constants.MaxUint256,
            0,
            BigNumber.from('1'),
          ]),
        ];
        const configs = [constants.HashZero, constants.HashZero, constants.HashZero, constants.HashZero];
        const tos = [hFunds.address, hCurve.address, hCurve.address, hCurve.address];

        // Generate execution data
        const data = genVaultExecData(
          aFurucombo,
          taskExecutor,
          tokensIn,
          amountsIn,
          [actionAmountIn],
          tokensOut,
          tos,
          configs,
          datas
        );

        // Get information before execution
        const shareBefore = await shareToken.balanceOf(investor.address);
        const collectorBalanceBefore = await denomination.balanceOf(collector.address);
        const reserveBefore = await fundProxy.getReserve();
        const outputTokenBefore = await outputToken.balanceOf(fundVault);
        const assetListBefore = await fundProxy.getAssetList();
        const assetValueBefore = await fundProxy.getGrossAssetValue();
        expect(assetListBefore.length).to.be.eq(1); // denomination only
        expect(assetListBefore[0]).to.be.eq(denomination.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // Execute strategy
        await fundProxy.connect(manager).execute(data);

        // ---- Verify ---- //
        // check share amount
        expect(await shareToken.balanceOf(investor.address)).to.be.eq(shareBefore);

        // check asset list
        const expectedAssetList = [inputToken.address, outputToken.address];
        await verifyAssetList(fundProxy, expectedAssetList);

        // check asset value
        const grossAssetValue = await fundProxy.getGrossAssetValue();
        expect(grossAssetValue).to.be.lt(assetValueBefore);
        await verifyAssetValue(fundVault, assetRouter, expectedAssetList, grossAssetValue, denomination.address);

        // check execution fee
        expect((await denomination.balanceOf(collector.address)).sub(collectorBalanceBefore)).to.be.eq(executionFee);

        // check reserve
        expect(await fundProxy.getReserve()).to.be.lt(reserveBefore);

        // check state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // checkout output token
        expect(await outputToken.balanceOf(fundVault)).to.be.gt(outputTokenBefore);
      });

      it('aave', async function () {
        // Strategy Step:
        // 1. aave flashloan
        // 2. aave deposit
        // 3. aave borrow
        // 4. aave repay
        // 5. aave withdraw

        // Prepare action data
        const rateMode = AAVE_RATEMODE.VARIABLE;
        const inputToken = denomination;
        const outputToken = denomination;
        const flashloanToken = denomination;
        const borrowToken = tokenA;
        const tokensIn = [inputToken.address];
        const amountIn = purchaseAmount;
        const amountsIn = [amountIn];
        const tokensOut = [outputToken.address];
        const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
        const actionAmountIn = amountIn.sub(executionFee);
        const flashloanAmount = mwei('100');
        const depositAmount = purchaseAmount.div(2);
        const borrowAmount = decimal6To18(depositAmount).div(2);
        const repayAmount = borrowAmount.div(2);
        const withdrawAmount = decimal18To6(repayAmount);
        const aTokenAddress = (await aaveLendingPool.getReserveData(inputToken.address)).aTokenAddress;
        const debtTokenAddress = (await aaveLendingPool.getReserveData(borrowToken.address)).variableDebtTokenAddress;

        // Permit dealing token
        await comptrollerProxy.permitAssets(level, [aTokenAddress, debtTokenAddress]);
        await assetRegistry.register(debtTokenAddress, aaveDebtResolver.address);
        await assetRegistry.register(aTokenAddress, aaveAssetResolver.address);

        // Prepare flashloan data
        const flashloanDatas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('deposit(address,uint256)', [inputToken.address, depositAmount]),
          simpleEncode('returnFunds(address[],uint256[])', [[aTokenAddress], [depositAmount]]),
          simpleEncode('borrow(address,uint256,uint256)', [borrowToken.address, borrowAmount, rateMode]),
          simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, repayAmount, rateMode]),
          simpleEncode('addFunds(address[],uint256[])', [[aTokenAddress], [withdrawAmount]]),
          simpleEncode('withdraw(address,uint256)', [inputToken.address, withdrawAmount]),
        ];

        const flashloanConfigs = [
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
          constants.HashZero,
        ];

        const flashloanTos = [
          hFunds.address,
          hAaveV2.address,
          hFunds.address,
          hAaveV2.address,
          hAaveV2.address,
          hFunds.address,
          hAaveV2.address,
        ];

        const params = ethers.utils.defaultAbiCoder.encode(
          ['address[]', 'bytes32[]', 'bytes[]'],
          [flashloanTos, flashloanConfigs, flashloanDatas]
        );

        // Prepare Furucombo data
        const datas = [
          simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [
            [flashloanToken.address],
            [flashloanAmount],
            [AAVE_RATEMODE.NODEBT], // modes
            params,
          ]),
        ];
        const configs = [constants.HashZero];
        const tos = [hAaveV2.address];

        // Generate execution data
        // TaskExecutor data
        const data = getCallData(taskExecutor, 'batchExec', [
          tokensIn,
          amountsIn,
          [aFurucombo.address, aFurucombo.address, aFurucombo.address, aFurucombo.address, aFurucombo.address],
          [constants.HashZero, constants.HashZero, constants.HashZero, constants.HashZero, constants.HashZero],
          [
            getCallData(aFurucombo, 'approveDelegation', [[debtTokenAddress], [constants.MaxUint256]]),
            getCallData(aFurucombo, 'approveToken', [[aTokenAddress], [constants.MaxUint256]]),
            getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, [actionAmountIn], tokensOut, tos, configs, datas]),
            getCallData(aFurucombo, 'approveToken', [[aTokenAddress], [constants.Zero]]),
            getCallData(aFurucombo, 'approveDelegation', [[debtTokenAddress], [constants.Zero]]),
          ],
        ]);

        // Get information before execution
        const shareBefore = await shareToken.balanceOf(investor.address);
        const collectorBalanceBefore = await denomination.balanceOf(collector.address);
        const reserveBefore = await fundProxy.getReserve();
        const outputTokenBefore = await outputToken.balanceOf(fundVault);
        const assetListBefore = await fundProxy.getAssetList();
        const assetValueBefore = await fundProxy.getGrossAssetValue();
        expect(assetListBefore.length).to.be.eq(1); // denomination only
        expect(assetListBefore[0]).to.be.eq(denomination.address);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // Execute strategy
        await fundProxy.connect(manager).execute(data);

        // ---- Verify ---- //
        // check share amount
        expect(await shareToken.balanceOf(investor.address)).to.be.eq(shareBefore);

        // check asset list
        const expectedAssetList = [inputToken.address, aTokenAddress, debtTokenAddress, borrowToken.address];
        await verifyAssetList(fundProxy, expectedAssetList);

        // check asset value
        const grossAssetValue = await fundProxy.getGrossAssetValue();
        expect(grossAssetValue).to.be.lt(assetValueBefore);
        await verifyAssetValue(fundVault, assetRouter, expectedAssetList, grossAssetValue, denomination.address);

        // check execution fee
        expect((await denomination.balanceOf(collector.address)).sub(collectorBalanceBefore)).to.be.eq(executionFee);

        // check reserve
        expect(await fundProxy.getReserve()).to.be.lt(reserveBefore);

        // check state
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

        // checkout output token
        expect(outputTokenBefore.sub(await outputToken.balanceOf(fundVault))).to.be.gt(depositAmount.sub(repayAmount));
      });

      describe('Specific scenarios', function () {
        it('should revert: the deposited pool is not supported that add liquidity through HCurve', async function () {
          // Some of the deposited pools will be used to swap tokens, but they will not be able to be used to add liquidity.
          // The goal of the test is to ensure that adding liquidity to these pools would fail.

          const wethAmount = ether('1');
          const wethToken = await ethers.getContractAt('IERC20', WETH_TOKEN);
          const wethProvider = await tokenProviderSushi(WETH_TOKEN);
          await wethToken.connect(wethProvider).transfer(await fundProxy.vault(), wethAmount);
          await comptrollerProxy.permitAssets(level, [WETH_TOKEN, DAI_TOKEN]);
          await fundProxy.connect(manager).addAsset(wethToken.address);

          const inputToken = wethToken;
          const poolTokenAddress = CURVE_ATRICRYPTO3;
          const tokensIn = [inputToken.address];
          const amountIn = wethAmount;
          const amountsIn = [amountIn];
          const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
          const actionAmountIn = amountIn.sub(executionFee);
          const tokens = [DAI_TOKEN, USDC_TOKEN, USDT_TOKEN, WBTC_TOKEN, WETH_TOKEN];
          const amounts = [
            constants.MaxUint256,
            constants.MaxUint256,
            constants.MaxUint256,
            constants.MaxUint256,
            constants.MaxUint256,
          ];

          // Furucombo data
          const datas = [
            simpleEncode('updateTokens(address[])', [[WETH_TOKEN]]),
            simpleEncode('exchangeUnderlyingUint256(address,address,address,uint256,uint256,uint256,uint256)', [
              atricrypto3Swap.address,
              WETH_TOKEN,
              DAI_TOKEN,
              4,
              0,
              actionAmountIn,
              BigNumber.from('1'),
            ]),
            simpleEncode('addLiquidity(address,address,address[],uint256[],uint256)', [
              atricrypto3Swap.address,
              poolTokenAddress,
              tokens,
              amounts,
              BigNumber.from('1'),
            ]),
          ];
          const configs = [constants.HashZero, constants.HashZero, constants.HashZero];
          const tos = [hFunds.address, hCurve.address, hCurve.address];

          // Generate execution data
          const data = genVaultExecData(
            aFurucombo,
            taskExecutor,
            tokensIn,
            amountsIn,
            [actionAmountIn],
            [],
            tos,
            configs,
            datas
          );

          await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith('RevertCode(29)'); // TASK_EXECUTOR_INVALID_DEALING_ASSET
        });

        it('should revert: the deposited pool is not supported that remove liquidity through HCurve', async function () {
          // Some of the deposited pools will be used to swap tokens, but they will not be able to be used to remove liquidity.
          // The goal of the test is to ensure that removing liquidity to these pools would fail.
          // There are two methods for preventing the use of pool tokens.
          // 1. Perform an initial asset check
          // 2. The pool token resolver should not be registered with the asset router.

          const poolTokenAmount = ether('1');
          const poolToken = await ethers.getContractAt('IERC20', CURVE_ATRICRYPTO3);
          const poolTokenProvider = await impersonateAndInjectEther(CURVE_ATRICRYPTO3_PROVIDER);
          await poolToken.connect(poolTokenProvider).transfer(await fundProxy.vault(), poolTokenAmount);

          const inputToken = poolToken;
          const tokensIn = [inputToken.address];
          const amountIn = poolTokenAmount;
          const amountsIn = [amountIn];
          const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
          const actionAmountIn = amountIn.sub(executionFee);

          // Furucombo data
          const datas = [
            simpleEncode('updateTokens(address[])', [[poolToken.address]]),
            simpleEncode('removeLiquidityOneCoinUint256(address,address,address,uint256,uint256,uint256)', [
              atricrypto3Swap.address,
              poolToken.address,
              DAI_TOKEN,
              poolTokenAmount,
              0,
              BigNumber.from('1'),
            ]),
          ];
          const configs = [constants.HashZero, constants.HashZero, constants.HashZero];
          const tos = [hFunds.address, hCurve.address, hCurve.address];

          // Generate execution data
          const data = genVaultExecData(
            aFurucombo,
            taskExecutor,
            tokensIn,
            amountsIn,
            [actionAmountIn],
            [],
            tos,
            configs,
            datas
          );

          await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith('RevertCode(34)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET
        });
      });
    });

    describe('Asset', function () {
      let path: string[];
      let tos: string[];

      beforeEach(async function () {
        path = [denomination.address, tokenA.address];
        tos = [hFunds.address, hQuickSwap.address];
      });

      it('add new asset in asset list', async function () {
        const amountIn = purchaseAmount.div(2);
        const beforeAssetList = await fundProxy.getAssetList();

        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        const afterAssetList = await fundProxy.getAssetList();
        expect(afterAssetList.length - beforeAssetList.length).to.be.eq(1);
        expect(afterAssetList[afterAssetList.length - 1]).to.be.eq(tokenA.address);
      });

      it('remove asset from asset list', async function () {
        const amountIn = purchaseAmount;
        const denominationCollectorBalance = await denomination.balanceOf(collector.address);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        expect(await fundProxy.getReserve()).to.be.eq(purchaseAmount.sub(amountIn));
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
        await verifyAssetList(fundProxy, [denomination.address, tokenA.address]); // add tokenA to asset list

        const tokenABalance = await tokenA.balanceOf(fundVault);
        path = [tokenA.address, tokenB.address];

        await execSwap(
          tokenABalance,
          execFeePercentage,
          tokenA.address,
          tokenB.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        // check collector will get execute fee
        expect((await denomination.balanceOf(collector.address)).sub(denominationCollectorBalance)).to.be.eq(
          amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE)
        );

        expect(await fundProxy.getReserve()).to.be.eq(purchaseAmount.sub(amountIn));
        expect(await tokenA.balanceOf(fundVault)).to.be.eq(0);
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
        await verifyAssetList(fundProxy, [denomination.address, tokenB.address]); // remove tokenA from asset list
      });

      it('get right amount target token', async function () {
        const amountIn = purchaseAmount;
        const tokenABalanceBefore = await tokenA.balanceOf(fundVault);
        const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
        const actionAmountIn = amountIn.sub(executionFee);
        const result = await quickRouter.getAmountsOut(actionAmountIn, path);

        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        expect(await denomination.balanceOf(fundVault)).to.be.eq(0);
        expect((await tokenA.balanceOf(fundVault)).sub(tokenABalanceBefore)).to.be.eq(result[result.length - 1]);
      });

      it('should revert: exec non permit asset', async function () {
        const amountIn = purchaseAmount;
        const invalidToken = await ethers.getContractAt('IERC20', LINK_TOKEN);

        await expect(
          execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            invalidToken.address,
            [denomination.address, invalidToken.address],
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(29)'); // TASK_EXECUTOR_INVALID_DEALING_ASSET
      });
    });

    describe('Execution', function () {
      let path: string[];
      let tos: string[];

      beforeEach(async function () {
        path = [denomination.address, tokenA.address];
        tos = [hFunds.address, hQuickSwap.address];
      });

      it('swap with all denomination', async function () {
        const amountIn = purchaseAmount;
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );
        const denominationAmount = await fundProxy.getReserve();
        const state = await fundProxy.state();
        expect(denominationAmount).to.be.eq(0);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('swap with partial denomination', async function () {
        const amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );
        const denominationAmount = await fundProxy.getReserve();
        const state = await fundProxy.state();
        expect(denominationAmount).to.be.eq(purchaseAmount.sub(amountIn));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('swap with zero execution fee', async function () {
        const newExecFeePercentage = 0;
        await comptrollerProxy.setExecFeePercentage(newExecFeePercentage);
        const amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          newExecFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );
        const denominationAmount = await fundProxy.getReserve();
        const state = await fundProxy.state();
        expect(denominationAmount).to.be.eq(purchaseAmount.sub(amountIn));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('disable initial asset checking', async function () {
        // swap partial denomination asset to the asset will be forbid
        let amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );
        const denominationAmount = await fundProxy.getReserve();
        const state = await fundProxy.state();
        expect(denominationAmount).to.be.eq(purchaseAmount.sub(amountIn));
        expect(state).to.be.eq(FUND_STATE.EXECUTING);

        // forbid asset
        await comptrollerProxy.forbidAssets(level, [tokenA.address]);

        // should revert by invalid initial asset checking
        amountIn = await tokenA.balanceOf(fundVault);
        path = [tokenA.address, denomination.address];
        await expect(
          execSwap(
            amountIn,
            execFeePercentage,
            tokenA.address,
            denomination.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(34)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET

        // disable initial check
        await comptrollerProxy.setInitialAssetCheck(false);

        // swap forbid token to denomination
        await execSwap(
          amountIn,
          execFeePercentage,
          tokenA.address,
          denomination.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        expect(await tokenA.balanceOf(fundVault)).to.be.eq(0);
        expect(state).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('should revert: swap with 99% execution fee', async function () {
        const newExecFeePercentage = FUND_PERCENTAGE_BASE * 0.99;
        await comptrollerProxy.setExecFeePercentage(newExecFeePercentage);
        const amountIn = purchaseAmount.div(2);

        await expect(
          execSwap(
            amountIn,
            newExecFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(13)'); // IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
      });

      it('should revert: swap with 0 denomination', async function () {
        const amountIn = BigNumber.from('0');
        const data = await getSwapData(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor
        );
        await expect(fundProxy.connect(manager).execute(data)).to.be.revertedWith(
          'injectAndBatchExec: 1_HQuickSwap_swapExactTokensForTokens: UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT'
        );
      });

      it('should revert: insufficient asset quota', async function () {
        const amountIn = purchaseAmount.div(2);
        const execFeePercentage = 0;

        await expect(
          execSwap(
            amountIn,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith(
          'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
        );
      });

      it('should revert: the gross asset value is lower than tolerance gross asset value', async function () {
        // Create unbalance pool for high slippage
        const trader = await tokenProviderSushi(denominationAddress);
        const traderAddress = await trader.getAddress();
        await denomination.connect(trader).approve(quickRouter.address, constants.MaxUint256);
        const traderBalance = await denomination.balanceOf(traderAddress);
        const path = [denomination.address, tokenAAddress];
        await quickRouter
          .connect(trader)
          .swapExactTokensForTokens(traderBalance, BigNumber.from('1'), path, traderAddress, constants.MaxUint256);

        // Purchase fund
        const amountIn = await denomination.balanceOf(denominationProviderAddress);
        await denomination.connect(denominationProvider).transfer(investor.address, amountIn);
        await purchaseFund(investor, fundProxy, denomination, shareToken, amountIn);

        // Execute strategy
        await expect(
          execSwap(
            amountIn.add(purchaseAmount),
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(13)'); // IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
      });

      it('should revert: oracle revert (aggregator revert)', async function () {
        const simpleTokenAmount = ether('100');
        const simpleToken = await (await ethers.getContractFactory('SimpleToken')).connect(investor).deploy();
        await simpleToken.deployed();
        await simpleToken.connect(investor).transfer(fundVault, simpleTokenAmount);
        await comptrollerProxy.permitAssets(level, [simpleToken.address]);
        await assetRegistry.register(simpleToken.address, canonicalResolver.address);

        // Register mock aggregator
        const aggregator = await (await ethers.getContractFactory('ChainlinkAggregatorV3MockB'))
          .connect(investor)
          .deploy();
        await aggregator.deployed();
        const oracle = await ethers.getContractAt('Chainlink', await assetRouter.oracle());
        await oracle.connect(owner).addAssets([simpleToken.address], [aggregator.address]);

        // Create denomination and simpleToken pool
        await quickFactory.createPair(denomination.address, simpleToken.address);
        await denomination.connect(investor).approve(quickRouter.address, constants.MaxUint256);
        await simpleToken.connect(investor).approve(quickRouter.address, constants.MaxUint256);
        await quickRouter
          .connect(investor)
          .addLiquidity(
            denomination.address,
            simpleToken.address,
            initialFunds.sub(purchaseAmount),
            simpleTokenAmount,
            BigNumber.from('1'),
            BigNumber.from('1'),
            investor.address,
            constants.MaxUint256
          );

        const path = [denomination.address, simpleToken.address];
        const tos = [hFunds.address, hQuickSwap.address];
        await aggregator.revertOn();
        await expect(
          execSwap(
            purchaseAmount,
            execFeePercentage,
            denomination.address,
            simpleToken.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('get price from oracle error');
      });

      it('should revert: oracle revert (not supported Aggregator)', async function () {
        const simpleTokenAmount = ether('100');
        const simpleToken = await (await ethers.getContractFactory('SimpleToken')).connect(investor).deploy();
        await simpleToken.deployed();
        await simpleToken.connect(investor).transfer(fundVault, simpleTokenAmount);
        await comptrollerProxy.permitAssets(level, [simpleToken.address]);
        await assetRegistry.register(simpleToken.address, canonicalResolver.address);

        // Create denomination and simpleToken pool
        await quickFactory.createPair(denomination.address, simpleToken.address);
        await denomination.connect(investor).approve(quickRouter.address, constants.MaxUint256);
        await simpleToken.connect(investor).approve(quickRouter.address, constants.MaxUint256);
        await quickRouter
          .connect(investor)
          .addLiquidity(
            denomination.address,
            simpleToken.address,
            initialFunds.sub(purchaseAmount),
            simpleTokenAmount,
            BigNumber.from('1'),
            BigNumber.from('1'),
            investor.address,
            constants.MaxUint256
          );

        const path = [denomination.address, simpleToken.address];
        const tos = [hFunds.address, hQuickSwap.address];
        await expect(
          execSwap(
            purchaseAmount,
            execFeePercentage,
            denomination.address,
            simpleToken.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(41)'); // CHAINLINK_ZERO_ADDRESS
      });

      it('should revert: fund is banned', async function () {
        await comptrollerProxy.banFundProxy(fundProxy.address);
        await expect(
          execSwap(
            purchaseAmount,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('RevertCode(1)'); // COMPTROLLER_BANNED
      });

      it('should revert: execute strategy in close', async function () {
        await fundProxy.connect(manager).close();
        expect(await fundProxy.state()).to.be.eq(FUND_STATE.CLOSED);

        await expect(
          execSwap(
            purchaseAmount,
            execFeePercentage,
            denomination.address,
            tokenA.address,
            path,
            tos,
            aFurucombo,
            taskExecutor,
            fundProxy,
            manager
          )
        ).to.be.revertedWith('InvalidState(5)');
      });
    });

    describe('Pending resolve', function () {
      let path: string[];
      let tos: string[];

      beforeEach(async function () {
        path = [denomination.address, tokenA.address];
        tos = [hFunds.address, hQuickSwap.address];

        const amountIn = purchaseAmount.div(2);
        await execSwap(
          amountIn,
          execFeePercentage,
          denomination.address,
          tokenA.address,
          path,
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        const redeemShare = purchasedShare;
        const acceptPending = true;
        const [, state] = await redeemFund(investor, fundProxy, denomination, redeemShare, acceptPending);
        expect(state).to.be.eq(FUND_STATE.PENDING);
      });

      it('resolve pending after executing strategy', async function () {
        const tokenABalance = await tokenA.balanceOf(fundVault);
        await execSwap(
          tokenABalance,
          execFeePercentage,
          tokenA.address,
          denomination.address,
          [tokenA.address, denomination.address],
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);
      });

      it('not resolve pending after executing strategy', async function () {
        const tokenABalance = (await tokenA.balanceOf(fundVault)).div(2);

        await execSwap(
          tokenABalance,
          execFeePercentage,
          tokenA.address,
          denomination.address,
          [tokenA.address, denomination.address],
          tos,
          aFurucombo,
          taskExecutor,
          fundProxy,
          manager
        );

        expect(await fundProxy.state()).to.be.eq(FUND_STATE.PENDING);
      });
    });
  });
});

function genVaultExecData(
  aFurucombo: any,
  taskExecutor: any,
  tokensIn: any,
  amountsIn: any,
  actionAmountIns: any,
  tokensOut: any,
  tos: any,
  configs: any,
  datas: any
) {
  // Action data
  const actionData = getCallData(aFurucombo, 'injectAndBatchExec', [
    tokensIn,
    actionAmountIns,
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
  return data;
}

async function verifyAssetList(fundProxy: FundImplementation, expectedAssetList: string[]) {
  const assetList = await fundProxy.getAssetList();
  expect(assetList.length).to.be.eq(expectedAssetList.length);
  expect(assetList).to.include.members(expectedAssetList);
}

async function verifyAssetValue(
  vault: string,
  assetRouter: AssetRouter,
  assetList: string[],
  assetValue: BigNumber,
  denominationAddress: string
) {
  const amounts: BigNumber[] = [];
  for (let i = 0; i < assetList.length; i++) {
    const token = await ethers.getContractAt('IERC20', assetList[i]);
    amounts.push(await token.balanceOf(vault));
  }

  const value = await assetRouter.calcAssetsTotalValue(assetList, amounts, denominationAddress);
  expect(value).to.be.eq(assetValue);
}
