import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { getEventArgs, asciiToHex32 } from '../utils/utils';
import { DS_PROXY_REGISTRY } from '../utils/constants';

const hre = require('hardhat');

export async function deployFurucomboProxyAndRegistry(): Promise<any> {
  const fRegistry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
  await fRegistry.deployed();

  const furucombo = await (await ethers.getContractFactory('FurucomboProxy')).deploy(fRegistry.address);
  await furucombo.deployed();
  return [fRegistry, furucombo];
}

// export async function deployHandlers(handlers: string[]): Promise<any> {
//   const result: any[] = [];
//   for (let i = 0; i < handlers.length; i++) {
//     const handler = await (
//       await ethers.getContractFactory(handlers[i])
//     ).deploy();
//     await handler.deployed();
//     result.push(handler);
//   }
//   return result;
// }

export async function deployContracts(handlers: string[], args: any[]): Promise<any> {
  const result: any[] = [];
  for (let i = 0; i < handlers.length; i++) {
    const handler = await (await ethers.getContractFactory(handlers[i])).deploy(...args[i]);
    await handler.deployed();
    result.push(handler);
  }
  return result;
}

export async function deployAssetOracleAndRouterAndRegistry(): Promise<any> {
  // Asset oracle
  const oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
  await oracle.deployed();
  // console.log('oracle', oracle.address);

  // AssetRegistry
  const assetRegistry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
  await assetRegistry.deployed();

  const assetRouter = await (
    await ethers.getContractFactory('AssetRouter')
  ).deploy(oracle.address, assetRegistry.address);
  await assetRouter.deployed();

  return [oracle, assetRegistry, assetRouter];
}

export async function deployMortgageVault(token: string): Promise<any> {
  const mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(token);
  await mortgageVault.deployed();

  return mortgageVault;
}

export async function deployAssetResolvers(resolvers: string[]): Promise<any> {
  const result: any[] = [];

  for (let i = 0; i < resolvers.length; i++) {
    const resolver = await (await ethers.getContractFactory(resolvers[i])).deploy();
    await resolver.deployed();
    result.push(resolver);
  }
  return result;
}

export async function deployComptrollerAndFundProxyFactory(
  dsProxyRegistry: string,
  assetRouterAddress: string,
  collectorAddress: string,
  execFeePercentage: any,
  liquidatorAddress: string,
  pendingExpiration: number,
  mortgageVaultAddress: string,
  totalAssetValueTolerance: any
): Promise<any> {
  const fundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
  await fundImplementation.deployed();

  // comptroller
  const comptroller = await _deployComptroller(
    fundImplementation.address,
    assetRouterAddress,
    collectorAddress,
    execFeePercentage,
    liquidatorAddress,
    pendingExpiration,
    mortgageVaultAddress,
    totalAssetValueTolerance
  );

  // FundProxyFactory
  const fundProxyFactory = await _deployFundProxyFactory(comptroller.address);

  return [fundImplementation, comptroller, fundProxyFactory];
}

export async function deployMockComptrollerAndFundProxyFactory(
  dsProxyRegistry: string,
  assetRouterAddress: string,
  collectorAddress: string,
  execFeePercentage: any,
  liquidatorAddress: string,
  pendingExpiration: number,
  mortgageVaultAddress: string,
  totalAssetValueTolerance: any
): Promise<any> {
  // implementation
  const fundImplementationMock = await (
    await ethers.getContractFactory('FundImplementationMock')
  ).deploy(dsProxyRegistry);
  await fundImplementationMock.deployed();

  // comptroller
  const comptroller = await _deployComptroller(
    fundImplementationMock.address,
    assetRouterAddress,
    collectorAddress,
    execFeePercentage,
    liquidatorAddress,
    pendingExpiration,
    mortgageVaultAddress,
    totalAssetValueTolerance
  );

  // FundProxyFactory
  const fundProxyFactory = await _deployFundProxyFactory(comptroller.address);

  return [fundImplementationMock, comptroller, fundProxyFactory];
}

async function _deployComptroller(
  fundImplementationAddress: any,
  assetRouterAddress: any,
  collectorAddress: any,
  execFeePercentage: any,
  liquidatorAddress: any,
  pendingExpiration: any,
  mortgageVaultAddress: any,
  totalAssetValueTolerance: any
): Promise<any> {
  const comptrollerImplementation = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
  await comptrollerImplementation.deployed();

  const setupAction = await (await ethers.getContractFactory('SetupAction')).deploy();
  await setupAction.deployed();

  const compData = comptrollerImplementation.interface.encodeFunctionData('initialize', [
    fundImplementationAddress,
    assetRouterAddress,
    collectorAddress,
    execFeePercentage,
    liquidatorAddress,
    pendingExpiration,
    mortgageVaultAddress,
    totalAssetValueTolerance,
    DS_PROXY_REGISTRY,
    setupAction.address,
  ]);

  const comptrollerProxy = await (
    await ethers.getContractFactory('ComptrollerProxy')
  ).deploy(comptrollerImplementation.address, compData);
  await comptrollerProxy.deployed();

  const comptroller = await (
    await ethers.getContractFactory('ComptrollerImplementation')
  ).attach(comptrollerProxy.address);

  return comptroller;
}

async function _deployFundProxyFactory(comptrollerAddress: any): Promise<any> {
  const fundProxyFactory = await (await ethers.getContractFactory('FundProxyFactory')).deploy(comptrollerAddress);
  await fundProxyFactory.deployed();
  return fundProxyFactory;
}

export async function createFundProxy(
  fundProxyFactory: any,
  manager: any,
  quoteAddress: any,
  level: any,
  mFeeRate: any,
  pFeeRate: any,
  crystallizationPeriod: any,
  shareTokenName: any
): Promise<any> {
  const receipt = await _createFund(
    fundProxyFactory,
    manager,
    quoteAddress,
    level,
    mFeeRate,
    pFeeRate,
    crystallizationPeriod,
    shareTokenName
  );
  const eventArgs = await getEventArgs(receipt, 'FundCreated');
  console.log('args.newFund', eventArgs.newFund);
  const fundProxy = await ethers.getContractAt('FundImplementation', eventArgs.newFund);
  return fundProxy;
}

export async function createFundProxyMock(
  fundProxyFactory: any,
  manager: any,
  quoteAddress: any,
  level: any,
  mFeeRate: any,
  pFeeRate: any,
  crystallizationPeriod: any,
  shareTokenName: any
): Promise<any> {
  const receipt = await _createFund(
    fundProxyFactory,
    manager,
    quoteAddress,
    level,
    mFeeRate,
    pFeeRate,
    crystallizationPeriod,
    shareTokenName
  );
  const eventArgs = await getEventArgs(receipt, 'FundCreated');
  console.log('args.newFund', eventArgs.newFund);
  const fundProxy = await ethers.getContractAt('FundImplementationMock', eventArgs.newFund);
  return fundProxy;
}

async function _createFund(
  fundProxyFactory: any,
  manager: Wallet,
  quoteAddress: any,
  level: any,
  mFeeRate: any,
  pFeeRate: any,
  crystallizationPeriod: any,
  shareTokenName: any
): Promise<any> {
  const receipt = await fundProxyFactory
    .connect(manager)
    .createFund(quoteAddress, level, mFeeRate, pFeeRate, crystallizationPeriod, shareTokenName);
  return receipt;
}

export async function deployTaskExecutorAndAFurucombo(
  comptrollerProxy: any,
  ownerAddress: any,
  furucomboAddress: any
): Promise<any> {
  const taskExecutor = await (
    await ethers.getContractFactory('TaskExecutor')
  ).deploy(ownerAddress, comptrollerProxy.address);
  await taskExecutor.deployed();
  await comptrollerProxy.setExecAction(taskExecutor.address);

  // AFurucombo
  const aFurucombo = await (
    await ethers.getContractFactory('AFurucombo')
  ).deploy(ownerAddress, furucomboAddress, comptrollerProxy.address);
  await aFurucombo.deployed();

  return [taskExecutor, aFurucombo];
}

export async function registerHandlers(registry: any, handlers: string[], descriptions: any[]): Promise<any> {
  for (let i = 0; i < handlers.length; i++) {
    await registry.register(handlers[i], asciiToHex32(descriptions[i]));
  }
}

export async function registerResolvers(registry: any, tokens: string[], resolvers: any[]): Promise<any> {
  for (let i = 0; i < tokens.length; i++) {
    await registry.register(tokens[i], resolvers[i]);
  }
}
