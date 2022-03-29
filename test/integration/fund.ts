import { constants, Wallet, Signer, BigNumber } from 'ethers';
import {
  simpleEncode,
  getCallData,
  mwei,
  increaseNextBlockTimeBy,
} from '../utils/utils';
import { expect } from 'chai';
import { ethers } from 'hardhat';

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
  PoolProxyFactory,
  PoolImplementation,
  PoolImplementationMock,
  ShareToken,
  HCurve,
  HQuickSwap,
  HSushiSwap,
} from '../../typechain';

import {
  DS_PROXY_REGISTRY,
  WL_ANY_SIG,
  POOL_STATE,
  FEE_BASE,
  ONE_YEAR,
} from '../utils/constants';

import {
  deployAssetOracleAndRouterAndRegistry,
  deployComptrollerAndPoolProxyFactory,
  deployMockComptrollerAndPoolProxyFactory,
  deployContracts,
  createPoolProxy,
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
  stakeAmount: any,
  mFeeRate: any,
  pFeeRate: any,
  execFeePercentage: any,
  pendingExpiration: any,
  crystallizationPeriod: any,
  reserveExecution: any,
  shareTokenName: string,
  fRegistry: Registry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hFunds: HFunds;
  let poolProxy: PoolImplementation;
  let shareToken: ShareToken;
  let poolVault: string;
  let oracle: Chainlink;
  let comptrollerProxy: ComptrollerImplementation;
  let assetRouter: AssetRouter;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

  [
    poolProxy,
    poolVault,
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
    stakeAmount,
    mFeeRate,
    pFeeRate,
    execFeePercentage,
    pendingExpiration,
    crystallizationPeriod,
    reserveExecution,
    shareTokenName,
    fRegistry,
    furucombo
  );

  await poolProxy.connect(manager).finalize();
  expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);

  return [
    poolProxy,
    poolVault,
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
  stakeAmount: any,
  mFeeRate: any,
  pFeeRate: any,
  execFeePercentage: any,
  pendingExpiration: any,
  crystallizationPeriod: any,
  reserveExecutionRatio: any,
  shareTokenName: string,
  fRegistry: Registry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let mortgage: IERC20;
  let poolProxyFactory: PoolProxyFactory;
  let aFurucombo: AFurucombo;
  let taskExecutor: TaskExecutor;
  let hFunds: HFunds;
  let poolProxy: PoolImplementation;
  let mortgageVault: MortgageVault;
  let shareToken: ShareToken;
  let poolVault: string;
  let oracle: Chainlink;
  let comptrollerProxy: ComptrollerImplementation;
  let assetRouter: AssetRouter;
  let hQuickSwap: HQuickSwap;
  let hSushiSwap: HSushiSwap;

  [
    poolProxyFactory,
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
    stakeAmount,
    execFeePercentage,
    pendingExpiration,
    fRegistry,
    furucombo
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
  shareToken = await ethers.getContractAt(
    'ShareToken',
    await poolProxy.shareToken()
  );
  poolVault = await poolProxy.vault();

  expect(await poolProxy.state()).to.be.eq(POOL_STATE.REVIEWING);

  // print log
  console.log('fRegistry', fRegistry.address);
  console.log('furucombo', furucombo.address);
  console.log('shareToken', shareToken.address);
  console.log('poolProxyFactory', poolProxyFactory.address);
  console.log('poolProxy', poolProxy.address);

  return [
    poolProxy,
    poolVault,
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
  stakeAmount: any,
  execFeePercentage: any,
  pendingExpiration: any,
  fRegistry: Registry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let mortgage: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let poolImplementation: PoolImplementation;
  let comptrollerProxy: ComptrollerImplementation;
  let poolProxyFactory: PoolProxyFactory;
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
  [oracle, assetRegistry, assetRouter] =
    await deployAssetOracleAndRouterAndRegistry();

  mortgageVault = await deployMortgageVault(mortgage.address);

  [poolImplementation, comptrollerProxy, poolProxyFactory] =
    await deployComptrollerAndPoolProxyFactory(
      DS_PROXY_REGISTRY,
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
    stakeAmount,
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

  console.log('oracle', oracle.address);
  console.log('assetRegistry', assetRegistry.address);
  console.log('assetRouter', assetRouter.address);
  console.log('poolImplementation', poolImplementation.address);
  console.log('comptrollerProxy', comptrollerProxy.address);
  console.log('taskExecutor', taskExecutor.address);
  console.log('aFurucombo', aFurucombo.address);

  return [
    poolProxyFactory,
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
  stakeAmount: any,
  execFeePercentage: any,
  pendingExpiration: any,
  fRegistry: Registry,
  furucombo: FurucomboProxy
): Promise<any> {
  let denomination: IERC20;
  let mortgage: IERC20;
  let tokenA: IERC20;
  let tokenB: IERC20;
  let oracle: Chainlink;
  let assetRegistry: AssetRegistry;
  let poolImplementationMock: PoolImplementationMock;
  let comptrollerProxy: ComptrollerImplementation;
  let poolProxyFactory: PoolProxyFactory;
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
  [oracle, assetRegistry, assetRouter] =
    await deployAssetOracleAndRouterAndRegistry();

  mortgageVault = await deployMortgageVault(mortgage.address);

  [poolImplementationMock, comptrollerProxy, poolProxyFactory] =
    await deployMockComptrollerAndPoolProxyFactory(
      DS_PROXY_REGISTRY,
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
    stakeAmount,
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

  console.log('oracle', oracle.address);
  console.log('assetRegistry', assetRegistry.address);
  console.log('assetRouter', assetRouter.address);
  console.log('pool implementationMock', poolImplementationMock.address);
  console.log('comptrollerProxy', comptrollerProxy.address);
  console.log('taskExecutor', taskExecutor.address);
  console.log('aFurucombo', aFurucombo.address);

  return [
    poolProxyFactory,
    taskExecutor,
    aFurucombo,
    hFunds,
    denomination,
    tokenA,
    tokenB,
    mortgage,
    mortgageVault,
    hQuickSwap,
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
  stakeAmount: any,
  fRegistry: Registry,
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
    [
      hFunds.address,
      hAaveV2.address,
      hCurve.address,
      hQuickSwap.address,
      hSushiSwap.address,
    ],
    ['HFunds', 'HAaveProtocolV2', 'HCurve', 'HQuickswap', 'HSushiswap']
  );

  // Setup comptroller whitelist
  await comptrollerProxy.permitDenominations(
    [denomination.address],
    [BigNumber.from('10')]
  );

  await comptrollerProxy.permitCreators([manager.address]);

  await comptrollerProxy.permitAssets(level, [
    denominationAddress,
    tokenA.address,
    tokenB.address,
  ]);

  await comptrollerProxy.permitDelegateCalls(
    level,
    [aFurucombo.address],
    [WL_ANY_SIG]
  );

  await comptrollerProxy.permitHandlers(
    level,
    [
      hAaveV2.address,
      hFunds.address,
      hCurve.address,
      hQuickSwap.address,
      hSushiSwap.address,
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

  // Set stake amount
  await comptrollerProxy.setStakedTier(level, stakeAmount);
}

// fund with denomination only
export async function setOperatingDenominationFund(
  investor: Wallet,
  poolProxy: PoolImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber
): Promise<any> {
  // purchase shares
  const [share, state] = await purchaseFund(
    investor,
    poolProxy,
    denomination,
    shareToken,
    purchaseAmount
  );
  expect(state).to.be.eq(POOL_STATE.EXECUTING);
  return share;
}

// fund with denomination and asset
export async function setOperatingAssetFund(
  manager: Wallet,
  investor: Wallet,
  poolProxy: PoolImplementation,
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

  const share = await setOperatingDenominationFund(
    investor,
    poolProxy,
    denomination,
    shareToken,
    purchaseAmount
  );

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
    poolProxy,
    manager
  );

  expect(await poolProxy.state()).to.be.eq(POOL_STATE.EXECUTING);

  return share;
}

export async function setObservingAssetFund(
  manager: Wallet,
  investor: Wallet,
  poolProxy: PoolImplementation,
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

  await setOperatingAssetFund(
    manager,
    investor,
    poolProxy,
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
  const [, state] = await redeemFund(
    investor,
    poolProxy,
    denomination,
    redeemAmount,
    true
  );
  expect(state).to.be.eq(POOL_STATE.REDEMPTION_PENDING);
}

export async function setLiquidatingAssetFund(
  manager: Wallet,
  investor: Wallet,
  liquidator: Wallet,
  poolProxy: PoolImplementation,
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
  hSwap: HQuickSwap | HSushiSwap,
  pendingExpiration: any
): Promise<any> {
  await setObservingAssetFund(
    manager,
    investor,
    poolProxy,
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

  await increaseNextBlockTimeBy(pendingExpiration);
  await poolProxy.connect(liquidator).liquidate();
  expect(await poolProxy.state()).to.be.eq(POOL_STATE.LIQUIDATING);
}

export async function setClosedDenominationFund(
  manager: Wallet,
  investor: Wallet,
  poolProxy: PoolImplementation,
  denomination: IERC20,
  shareToken: ShareToken,
  purchaseAmount: BigNumber
): Promise<any> {
  const share = await setOperatingDenominationFund(
    investor,
    poolProxy,
    denomination,
    shareToken,
    purchaseAmount
  );
  await poolProxy.connect(manager).close();
  const state = await poolProxy.state();
  expect(state).to.be.eq(POOL_STATE.CLOSED);

  return share;
}

export async function purchaseFund(
  investor: Wallet,
  poolProxy: PoolImplementation | PoolImplementationMock,
  denomination: IERC20,
  shareToken: ShareToken,
  amount: any
): Promise<any> {
  const initShareTokenAmount = await shareToken.balanceOf(investor.address);
  await denomination.connect(investor).approve(poolProxy.address, amount);
  await poolProxy.connect(investor).purchase(amount);
  const afterShareTokenAmount = await shareToken.balanceOf(investor.address);
  const share = await afterShareTokenAmount.sub(initShareTokenAmount);
  const state = await poolProxy.state();
  return [share, state];
}

export async function redeemFund(
  investor: Wallet,
  poolProxy: PoolImplementation | PoolImplementationMock,
  denomination: IERC20,
  shareAmount: any,
  acceptPending: any
): Promise<any> {
  const initDenominationAmount = await denomination.balanceOf(investor.address);
  await poolProxy.connect(investor).redeem(shareAmount, acceptPending);
  const afterDenominationAmount = await denomination.balanceOf(
    investor.address
  );
  const denominationBalance = afterDenominationAmount.sub(
    initDenominationAmount
  );
  const state = await poolProxy.state();
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
  poolProxy: PoolImplementation,
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
  await poolProxy.connect(manager).execute(data);
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
  const actionAmountIn = amountIn
    .mul(BigNumber.from(FEE_BASE).sub(execFeePercentage))
    .div(FEE_BASE);
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
