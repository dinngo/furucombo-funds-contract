import { constants, Wallet, BigNumber } from 'ethers';
import { simpleEncode, getCallData, increaseNextBlockTimeBy } from '../utils/utils';
import { expect } from 'chai';
import { ethers } from 'hardhat';

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
  FundProxyFactory,
  FundImplementation,
  FundImplementationMock,
  ShareToken,
  HCurve,
  HQuickSwap,
  HSushiSwap,
} from '../../typechain';

import { WL_ANY_SIG, FUND_STATE, FUND_PERCENTAGE_BASE, ONE_YEAR } from '../utils/constants';

import {
  deployAssetOracleAndRouterAndRegistry,
  deployComptrollerAndFundProxyFactory,
  deployMockComptrollerAndFundProxyFactory,
  deployContracts,
  createFundProxy,
  deployMortgageVault,
  deployTaskExecutorAndAFurucombo,
  registerHandlers,
  registerResolvers,
} from './deploy';
import { ComptrollerImplementation } from '../../typechain/ComptrollerImplementation';

export async function createFund(
  owner: Wallet,
  collector: Wallet,
  manager: Wallet,
  liquidator: Wallet,
  denominationAddress: string,
  mortgageAddress: string,
  tokenAAddress: string,
  tokenBAddress: string,
  denominationAggregator: string,
  tokenAAggregator: string,
  tokenBAggregator: string,
  level: any,
  mortgageAmount: any,
  mFeeRate: any,
  pFeeRate: any,
  execFeePercentage: any,
  pendingExpiration: any,
  valueTolerance: any,
  crystallizationPeriod: any,
  shareTokenName: string,
  fRegistry: FurucomboRegistry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hFunds: HFunds;
  let fundProxy: FundImplementation;
  let shareToken: ShareToken;
  let fundVault: string;
  let oracle: Chainlink;
  let comptrollerProxy: ComptrollerImplementation;
  let assetRouter: AssetRouter;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

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
    oracle,
    comptrollerProxy,
    assetRouter,
    hQuickSwap,
    hSushiSwap,
  ] = await createReviewingFund(
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

  await fundProxy.connect(manager).finalize();
  expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

  return [
    fundProxy,
    fundVault,
    denomination,
    shareToken,
    taskExecutor,
    aFurucombo,
    hFunds,
    tokenA,
    tokenB,
    oracle,
    comptrollerProxy,
    assetRouter,
    hQuickSwap,
    hSushiSwap,
  ];
}

export async function createReviewingFund(
  owner: Wallet,
  collector: Wallet,
  manager: Wallet,
  liquidator: Wallet,
  denominationAddress: string,
  mortgageAddress: string,
  tokenAAddress: string,
  tokenBAddress: string,
  denominationAggregator: string,
  tokenAAggregator: string,
  tokenBAggregator: string,
  level: any,
  mortgageAmount: any,
  mFeeRate: any,
  pFeeRate: any,
  execFeePercentage: any,
  pendingExpiration: any,
  valueTolerance: any,
  crystallizationPeriod: any,
  shareTokenName: string,
  fRegistry: FurucomboRegistry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let mortgage: IERC20;
  let fundProxyFactory: FundProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hFunds: HFunds;
  let fundProxy: FundImplementation;
  let mortgageVault: MortgageVault;
  let shareToken: ShareToken;
  let fundVault: string;
  let oracle: Chainlink;
  let comptrollerProxy: ComptrollerImplementation;
  let assetRouter: AssetRouter;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

  [
    fundProxyFactory,
    taskExecutor,
    aFurucombo,
    hFunds,
    denomination,
    tokenA,
    tokenB,
    mortgage,
    mortgageVault,
    oracle,
    comptrollerProxy,
    assetRouter,
    hQuickSwap,
    hSushiSwap,
  ] = await createFundInfra(
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
    execFeePercentage,
    pendingExpiration,
    valueTolerance,
    fRegistry,
    furucombo
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
    shareTokenName
  );
  shareToken = await ethers.getContractAt('ShareToken', await fundProxy.shareToken());
  fundVault = await fundProxy.vault();

  expect(await fundProxy.state()).to.be.eq(FUND_STATE.REVIEWING);

  return [
    fundProxy,
    fundVault,
    denomination,
    shareToken,
    taskExecutor,
    aFurucombo,
    hFunds,
    tokenA,
    tokenB,
    oracle,
    comptrollerProxy,
    assetRouter,
    hQuickSwap,
    hSushiSwap,
    mortgage,
  ];
}

export async function createFundInfra(
  owner: Wallet,
  collector: Wallet,
  manager: Wallet,
  liquidator: Wallet,
  denominationAddress: string,
  mortgageAddress: string,
  tokenAAddress: string,
  tokenBAddress: string,
  denominationAggregator: string,
  tokenAAggregator: string,
  tokenBAggregator: string,
  level: any,
  mortgageAmount: any,
  execFeePercentage: any,
  pendingExpiration: any,
  valueTolerance: any,
  fRegistry: FurucomboRegistry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let mortgage: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let fundImplementation: FundImplementation;
  let comptrollerProxy: ComptrollerImplementation;
  let fundProxyFactory: FundProxyFactory;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hAaveV2: HAaveProtocolV2;
  let hFunds: HFunds;
  let hCurve: HCurve;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

  denomination = await ethers.getContractAt('IERC20', denominationAddress);
  mortgage = await ethers.getContractAt('IERC20', mortgageAddress);
  tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
  tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

  // Deploy furucombo funds contracts
  [oracle, assetRegistry, assetRouter] = await deployAssetOracleAndRouterAndRegistry();

  mortgageVault = await deployMortgageVault(mortgage.address);

  [fundImplementation, comptrollerProxy, fundProxyFactory] = await deployComptrollerAndFundProxyFactory(
    assetRouter.address,
    collector.address,
    execFeePercentage,
    liquidator.address,
    pendingExpiration,
    mortgageVault.address,
    valueTolerance
  );

  [taskExecutor, aFurucombo] = await deployTaskExecutorAndAFurucombo(
    comptrollerProxy,
    owner.address,
    furucombo.address
  );

  // Register furucombo handlers
  [hAaveV2, hFunds, hCurve, hQuickSwap, hSushiSwap] = await deployContracts(
    ['HAaveProtocolV2', 'HFunds', 'HCurve', 'HQuickSwap', 'HSushiSwap'],
    [[], [], [], [], []]
  );
  await _setupFundInfra(
    owner,
    manager,
    denominationAddress,
    tokenAAddress,
    tokenBAddress,
    denominationAggregator,
    tokenAAggregator,
    tokenBAggregator,
    level,
    mortgageAmount,
    fRegistry,
    comptrollerProxy,
    aFurucombo,
    assetRegistry,
    oracle,
    hFunds,
    hAaveV2,
    hCurve,
    hQuickSwap,
    hSushiSwap
  );

  return [
    fundProxyFactory,
    taskExecutor,
    aFurucombo,
    hFunds,
    denomination,
    tokenA,
    tokenB,
    mortgage,
    mortgageVault,
    oracle,
    comptrollerProxy,
    assetRouter,
    hQuickSwap,
    hSushiSwap,
  ];
}

export async function createMockFundInfra(
  owner: Wallet,
  collector: Wallet,
  manager: Wallet,
  liquidator: Wallet,
  denominationAddress: string,
  mortgageAddress: string,
  tokenAAddress: string,
  tokenBAddress: string,
  denominationAggregator: string,
  tokenAAggregator: string,
  tokenBAggregator: string,
  level: any,
  mortgageAmount: any,
  execFeePercentage: any,
  pendingExpiration: any,
  fRegistry: FurucomboRegistry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let mortgage: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let fundImplementationMock: FundImplementationMock;
  let comptrollerProxy: ComptrollerImplementation;
  let fundProxyFactory: FundProxyFactory;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hAaveV2: HAaveProtocolV2;
  let hFunds: HFunds;
  let hCurve: HCurve;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

  denomination = await ethers.getContractAt('IERC20', denominationAddress);
  mortgage = await ethers.getContractAt('IERC20', mortgageAddress);
  tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
  tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

  // Deploy furucombo funds contracts
  [oracle, assetRegistry, assetRouter] = await deployAssetOracleAndRouterAndRegistry();

  mortgageVault = await deployMortgageVault(mortgage.address);

  [fundImplementationMock, comptrollerProxy, fundProxyFactory] = await deployMockComptrollerAndFundProxyFactory(
    assetRouter.address,
    collector.address,
    execFeePercentage,
    liquidator.address,
    pendingExpiration,
    mortgageVault.address,
    0
  );

  [taskExecutor, aFurucombo] = await deployTaskExecutorAndAFurucombo(
    comptrollerProxy,
    owner.address,
    furucombo.address
  );

  // Register furucombo handlers
  [hAaveV2, hFunds, hCurve, hQuickSwap, hSushiSwap] = await deployContracts(
    ['HAaveProtocolV2', 'HFunds', 'HCurve', 'HQuickSwap', 'HSushiSwap'],
    [[], [], [], [], []]
  );
  await _setupFundInfra(
    owner,
    manager,
    denominationAddress,
    tokenAAddress,
    tokenBAddress,
    denominationAggregator,
    tokenAAggregator,
    tokenBAggregator,
    level,
    mortgageAmount,
    fRegistry,
    comptrollerProxy,
    aFurucombo,
    assetRegistry,
    oracle,
    hFunds,
    hAaveV2,
    hCurve,
    hQuickSwap,
    hSushiSwap
  );

  return [
    fundProxyFactory,
    taskExecutor,
    aFurucombo,
    hFunds,
    denomination,
    tokenA,
    tokenB,
    mortgage,
    mortgageVault,
    hQuickSwap,
    oracle,
  ];
}

async function _setupFundInfra(
  owner: Wallet,
  manager: Wallet,
  denominationAddress: string,
  tokenAAddress: string,
  tokenBAddress: string,
  denominationAggregator: string,
  tokenAAggregator: string,
  tokenBAggregator: string,
  level: any,
  mortgageAmount: any,
  fRegistry: FurucomboRegistry,
  comptrollerProxy: ComptrollerImplementation,
  aFurucombo: AFurucombo,
  assetRegistry: AssetRegistry,
  oracle: Chainlink,
  hFunds: HFunds,
  hAaveV2: HAaveProtocolV2,
  hCurve: HCurve,
  hQuickSwap: HQuickSwap,
  hSushiSwap: HSushiSwap
): Promise<any> {
  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;

  denomination = await ethers.getContractAt('IERC20', denominationAddress);
  tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
  tokenB = await ethers.getContractAt('IERC20', tokenBAddress);

  await registerHandlers(
    fRegistry,
    [hFunds.address, hAaveV2.address, hCurve.address, hQuickSwap.address, hSushiSwap.address],
    ['HFunds', 'HAaveProtocolV2', 'HCurve', 'HQuickswap', 'HSushiswap']
  );

  // Setup comptroller whitelist
  await comptrollerProxy.permitDenominations([denomination.address], [BigNumber.from('10')]);

  await comptrollerProxy.permitCreators([manager.address]);

  await comptrollerProxy.permitAssets(level, [denominationAddress, tokenA.address, tokenB.address]);

  await comptrollerProxy.permitDelegateCalls(level, [aFurucombo.address], [WL_ANY_SIG]);

  await comptrollerProxy.permitHandlers(
    level,
    [hAaveV2.address, hFunds.address, hCurve.address, hQuickSwap.address, hSushiSwap.address],
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
    [canonicalResolver.address, canonicalResolver.address, canonicalResolver.address]
  );

  // Set stake amount
  await comptrollerProxy.setMortgageTier(level, mortgageAmount);
}

// fund with denomination only
export async function setExecutingDenominationFund(
  investor: Wallet,
  fundProxy: FundImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber
): Promise<any> {
  // purchase shares
  const [share, state] = await purchaseFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  expect(state).to.be.eq(FUND_STATE.EXECUTING);
  return share;
}

// fund with denomination and asset
export async function setExecutingAssetFund(
  manager: Wallet,
  investor: Wallet,
  fundProxy: FundImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber,
  swapAmount: BigNumber,
  execFeePercentage: any,
  inTokenAddress: string,
  outTokenAddress: string,
  hFunds: HFunds,
  aFurucombo: AFurucombo,
  taskExecutor: TaskExecutor,
  hSwap: HQuickSwap | HSushiSwap
): Promise<any> {
  expect(swapAmount).to.be.gt(BigNumber.from('0'));

  const share = await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);

  // spend denomination
  await execSwap(
    swapAmount,
    execFeePercentage,
    inTokenAddress,
    outTokenAddress,
    [inTokenAddress, outTokenAddress],
    [hFunds.address, hSwap.address],
    aFurucombo,
    taskExecutor,
    fundProxy,
    manager
  );

  expect(await fundProxy.state()).to.be.eq(FUND_STATE.EXECUTING);

  return share;
}

export async function setPendingAssetFund(
  manager: Wallet,
  investor: Wallet,
  fundProxy: FundImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber,
  swapAmount: BigNumber,
  redeemAmount: BigNumber,
  execFeePercentage: any,
  inTokenAddress: string,
  outTokenAddress: string,
  hFunds: HFunds,
  aFurucombo: AFurucombo,
  taskExecutor: TaskExecutor,
  hSwap: HQuickSwap | HSushiSwap
): Promise<any> {
  expect(redeemAmount.lte(purchaseAmount)).to.be.true;

  await setExecutingAssetFund(
    manager,
    investor,
    fundProxy,
    denomination,
    shareToken,
    purchaseAmount,
    swapAmount,
    execFeePercentage,
    inTokenAddress,
    outTokenAddress,
    hFunds,
    aFurucombo,
    taskExecutor,
    hSwap
  );

  // redeem shares to enter pending state
  const [, state] = await redeemFund(investor, fundProxy, denomination, redeemAmount, true);
  expect(state).to.be.eq(FUND_STATE.PENDING);
}

export async function setLiquidatingAssetFund(
  manager: Wallet,
  investor: Wallet,
  liquidator: Wallet,
  fundProxy: FundImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber,
  swapAmount: BigNumber,
  redeemAmount: BigNumber,
  execFeePercentage: any,
  inTokenAddress: string,
  outTokenAddress: string,
  hFunds: HFunds,
  aFurucombo: AFurucombo,
  taskExecutor: TaskExecutor,
  oracle: Chainlink,
  hSwap: HQuickSwap | HSushiSwap,
  pendingExpiration: any
): Promise<any> {
  await setPendingAssetFund(
    manager,
    investor,
    fundProxy,
    denomination,
    shareToken,
    purchaseAmount,
    swapAmount,
    redeemAmount,
    execFeePercentage,
    inTokenAddress,
    outTokenAddress,
    hFunds,
    aFurucombo,
    taskExecutor,
    hSwap
  );

  // Set oracle stale period
  await oracle.setStalePeriod(pendingExpiration * 2);

  await increaseNextBlockTimeBy(pendingExpiration);
  await fundProxy.connect(liquidator).liquidate();
  expect(await fundProxy.state()).to.be.eq(FUND_STATE.LIQUIDATING);
}

export async function setClosedDenominationFund(
  manager: Wallet,
  investor: Wallet,
  fundProxy: FundImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber
): Promise<any> {
  const share = await setExecutingDenominationFund(investor, fundProxy, denomination, shareToken, purchaseAmount);
  await fundProxy.connect(manager).close();
  const state = await fundProxy.state();
  expect(state).to.be.eq(FUND_STATE.CLOSED);

  return share;
}

export async function purchaseFund(
  investor: Wallet,
  fundProxy: FundImplementation | FundImplementationMock,
  denomination: IERC20,
  shareToken: ShareToken,
  amount: any
): Promise<[BigNumber, any]> {
  const initShareTokenAmount = await shareToken.balanceOf(investor.address);
  await denomination.connect(investor).approve(fundProxy.address, amount);
  await fundProxy.connect(investor).purchase(amount);
  const afterShareTokenAmount = await shareToken.balanceOf(investor.address);
  const share = await afterShareTokenAmount.sub(initShareTokenAmount);
  const state = await fundProxy.state();
  return [share, state];
}

export async function redeemFund(
  investor: Wallet,
  fundProxy: FundImplementation | FundImplementationMock,
  denomination: IERC20,
  shareAmount: any,
  acceptPending: any
): Promise<any> {
  const initDenominationAmount = await denomination.balanceOf(investor.address);
  await fundProxy.connect(investor).redeem(shareAmount, acceptPending);
  const afterDenominationAmount = await denomination.balanceOf(investor.address);
  const denominationBalance = afterDenominationAmount.sub(initDenominationAmount);
  const state = await fundProxy.state();
  return [denominationBalance, state];
}

// swap inTokenAddress to outTokenAddress
export async function execSwap(
  amountIn: BigNumber,
  execFeePercentage: any,
  inTokenAddress: string,
  outTokenAddress: string,
  path: string[],
  tos: string[],
  aFurucombo: AFurucombo,
  taskExecutor: TaskExecutor,
  fundProxy: FundImplementation,
  manager: Wallet
): Promise<any> {
  const data = await getSwapData(
    amountIn,
    execFeePercentage,
    inTokenAddress,
    outTokenAddress,
    path,
    tos,
    aFurucombo,
    taskExecutor
  );

  // Execute strategy
  await fundProxy.connect(manager).execute(data);
}

export async function getSwapData(
  amountIn: BigNumber,
  execFeePercentage: any,
  inTokenAddress: string,
  outTokenAddress: string,
  path: string[],
  tos: string[],
  aFurucombo: AFurucombo,
  taskExecutor: TaskExecutor
): Promise<any> {
  // Prepare action data

  const executionFee = amountIn.mul(execFeePercentage).div(FUND_PERCENTAGE_BASE);
  const actionAmountIn = amountIn.sub(executionFee);

  const tokensIn = [inTokenAddress];
  const amountsIn = [amountIn];
  const tokensOut = [outTokenAddress];

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
  return data;
}
