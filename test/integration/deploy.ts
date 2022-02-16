import { ethers } from 'hardhat';
import { getEventArgs, asciiToHex32 } from '../utils/utils';

const hre = require('hardhat');

export async function deployFurucomboProxyAndRegistry(): Promise<any> {
  const fRegistry = await (
    await ethers.getContractFactory('Registry')
  ).deploy();
  await fRegistry.deployed();

  const furucombo = await (
    await ethers.getContractFactory('FurucomboProxy')
  ).deploy(fRegistry.address);
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

export async function deployContracts(
  handlers: string[],
  args: any[]
): Promise<any> {
  const result: any[] = [];
  for (let i = 0; i < handlers.length; i++) {
    const handler = await (
      await ethers.getContractFactory(handlers[i])
    ).deploy(...args[i]);
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
  const assetRegistry = await (
    await ethers.getContractFactory('AssetRegistry')
  ).deploy();
  await assetRegistry.deployed();

  const assetRouter = await (
    await ethers.getContractFactory('AssetRouter')
  ).deploy(oracle.address, assetRegistry.address);
  await assetRouter.deployed();

  return [oracle, assetRegistry, assetRouter];
}

export async function deployMortgageVault(token: string): Promise<any> {
  const mortgageVault = await (
    await ethers.getContractFactory('MortgageVault')
  ).deploy(token);
  await mortgageVault.deployed();

  return mortgageVault;
}

export async function deployAssetResolvers(resolvers: string[]): Promise<any> {
  const result: any[] = [];

  for (let i = 0; i < resolvers.length; i++) {
    const resolver = await (
      await ethers.getContractFactory(resolvers[i])
    ).deploy();
    await resolver.deployed();
    result.push(resolver);
  }
  return result;
}

export async function deployComptrollerAndPoolProxyFactory(
  dsProxyRegistry: string,
  assetRouterAddress: string,
  collectorAddress: string,
  execFeePercentage: any,
  mortgageVaultAddress: string
): Promise<any> {
  const implementation = await (
    await ethers.getContractFactory('Implementation')
  ).deploy(dsProxyRegistry);
  await implementation.deployed();

  // comptroller
  const comptroller = await (
    await ethers.getContractFactory('Comptroller')
  ).deploy(
    implementation.address,
    assetRouterAddress,
    collectorAddress,
    execFeePercentage,
    mortgageVaultAddress
  );
  await comptroller.deployed();

  // PoolProxyFactory
  const poolProxyFactory = await (
    await ethers.getContractFactory('PoolProxyFactory')
  ).deploy(comptroller.address);
  await poolProxyFactory.deployed();

  return [implementation, comptroller, poolProxyFactory];
}

export async function createPoolProxy(
  poolProxyFactory: any,
  manager: any,
  quoteAddress: any,
  level: any,
  mFeeRate: any,
  pFeeRate: any,
  crystallizationPeriod: any,
  reserveExecution: any,
  shareTokenName: any,
  shareTokenSymbol: any
): Promise<any> {
  const receipt = await poolProxyFactory
    .connect(manager)
    .createPool(
      quoteAddress,
      level,
      mFeeRate,
      pFeeRate,
      crystallizationPeriod,
      reserveExecution,
      shareTokenName,
      shareTokenSymbol
    );
  const eventArgs = await getEventArgs(receipt, 'PoolCreated');
  console.log('args.newPool', eventArgs.newPool);
  const poolProxy = await ethers.getContractAt(
    'Implementation',
    eventArgs.newPool
  );
  return poolProxy;
}

export async function deployTaskExecutorAndAFurucombo(
  comptroller: any,
  ownerAddress: any,
  furucomboAddress: any
): Promise<any> {
  const taskExecutor = await (
    await ethers.getContractFactory('TaskExecutor')
  ).deploy(ownerAddress, comptroller.address);
  await taskExecutor.deployed();
  await comptroller.setExecAction(taskExecutor.address);

  // AFurucombo
  const aFurucombo = await (
    await ethers.getContractFactory('AFurucombo')
  ).deploy(ownerAddress, furucomboAddress, comptroller.address);
  await aFurucombo.deployed();

  return [taskExecutor, aFurucombo];
}

export async function registerHandlers(
  registry: any,
  handlers: string[],
  descriptions: any[]
): Promise<any> {
  for (let i = 0; i < handlers.length; i++) {
    await registry.register(handlers[i], asciiToHex32(descriptions[i]));
  }
}

export async function registerResolvers(
  registry: any,
  tokens: string[],
  resolvers: any[]
): Promise<any> {
  for (let i = 0; i < tokens.length; i++) {
    await registry.register(tokens[i], resolvers[i]);
  }
}
