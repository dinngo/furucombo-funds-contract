import { BigNumber, Signer } from 'ethers';
import { ethers } from 'hardhat';
import {
  RecordActionResultSig,
  DeltaGasSig,
  USDC_TOKEN,
  WETH_TOKEN,
  WMATIC_TOKEN,
  QUICKSWAP_FACTORY,
  SUSHISWAP_FACTORY,
  RecordHandlerResultSig,
} from './constants';
const hre = require('hardhat');

export async function profileGas(receipt: any) {
  const result = await receipt.wait();

  result.events.forEach((element: any) => {
    if (element.topics[0] === DeltaGasSig) {
      const [tag, gas] = ethers.utils.defaultAbiCoder.decode(
        ['bytes32', 'uint256'],
        element.data
      );
      console.log(ethers.utils.toUtf8String(tag) + ': ' + gas.toString());
    }
  });
}

export function ether(num: any) {
  return ethers.utils.parseUnits(num, 'ether');
}

export async function getTaskExecutorFundQuotas(
  proxy: any,
  taskExecutor: any,
  tokensIn: string[]
) {
  const returnData = await proxy.callStatic.executeMock(
    taskExecutor.address,
    getCallData(taskExecutor, 'getFundQuotas', [tokensIn])
  );

  const fundQuotas = ethers.utils.defaultAbiCoder.decode(
    ['uint256[]'],
    returnData
  )[0];
  return fundQuotas;
}

export async function getTaskExecutorDealingAssets(
  proxy: any,
  taskExecutor: any
) {
  const returnData = await proxy.callStatic.executeMock(
    taskExecutor.address,
    getCallData(taskExecutor, 'getDealingAssetList', [])
  );

  const assets = ethers.utils.defaultAbiCoder.decode(
    ['address[]'],
    returnData
  )[0];
  return assets;
}

export function getCallData(artifact: any, name: string, params: any) {
  return artifact.interface.encodeFunctionData(name, params);
}

export function getCallActionData(
  ethValue: any,
  artifact: any,
  funcName: string,
  params: any
) {
  return ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'bytes'],
    [ethValue, getCallData(artifact, funcName, params)]
  );
}

export async function impersonateAndInjectEther(address: string) {
  // Impersonate pair
  await hre.network.provider.send('hardhat_impersonateAccount', [address]);

  // Inject 1 ether
  await hre.network.provider.send('hardhat_setBalance', [
    address,
    '0xde0b6b3a7640000',
  ]);
  return await (ethers as any).getSigner(address);
}

export function simpleEncode(_func: string, params: any) {
  const func = 'function ' + _func;
  const abi = [func];
  const iface = new ethers.utils.Interface(abi);
  const data = iface.encodeFunctionData(_func, params);

  return data;
}

export async function getActionReturn(receipt: any, dataTypes: any) {
  let actionResult: any;
  const result = await receipt.wait();

  result.events.forEach((element: any) => {
    if (element.topics[0] === RecordActionResultSig) {
      const bytesData = ethers.utils.defaultAbiCoder.decode(
        ['bytes'],
        element.data
      )[0];

      actionResult = ethers.utils.defaultAbiCoder.decode(
        dataTypes,
        bytesData
      )[0];
    }
  });
  return actionResult;
}

export async function getHandlerReturn(receipt: any, dataTypes: any) {
  let actionResult: any;
  const result = await receipt.wait();

  result.events.forEach((element: any) => {
    if (element.topics[0] === RecordHandlerResultSig) {
      const bytesData = ethers.utils.defaultAbiCoder.decode(
        ['bytes'],
        element.data
      )[0];

      actionResult = ethers.utils.defaultAbiCoder.decode(
        dataTypes,
        bytesData
      )[0];
    }
  });
  return actionResult;

  // let handlerResult;
  // receipt.receipt.rawLogs.forEach((element) => {
  //   if (element.topics[0] === RecordHandlerResultSig) {
  //     const bytesData = web3.eth.abi.decodeParameters(
  //       ['bytes'],
  //       element.data
  //     )[0];
  //     handlerResult = web3.eth.abi.decodeParameters(dataTypes, bytesData);
  //   }
  // });
  // return handlerResult;
}

export function asciiToHex32(s: string) {
  // Right Pad
  return ethers.utils.formatBytes32String(s);
}

export async function balanceDelta(addr: string, b: BigNumber) {
  return (await ethers.provider.getBalance(addr)).sub(b);
}

export async function getGasConsumption(receipt: any) {
  const result = await receipt.wait();
  return result.gasUsed.mul(receipt.gasPrice);
}

export function getFuncSig(artifact: any, name: string) {
  return artifact.interface.getSighash(name);
}

export async function tokenProviderQuick(
  token0 = USDC_TOKEN,
  token1 = WETH_TOKEN,
  factoryAddress = QUICKSWAP_FACTORY
) {
  if (token0 === WETH_TOKEN) {
    token1 = USDC_TOKEN;
  }
  return _tokenProviderUniLike(token0, token1, factoryAddress);
}

export async function maticProviderWmatic() {
  // Impersonate wmatic
  await hre.network.provider.send('hardhat_impersonateAccount', [WMATIC_TOKEN]);
  return await (ethers as any).getSigner(WMATIC_TOKEN);

  // return WMATIC_TOKEN;
}

export async function tokenProviderSushi(
  token0 = USDC_TOKEN,
  token1 = WETH_TOKEN,
  factoryAddress = SUSHISWAP_FACTORY
) {
  if (token0 === WETH_TOKEN) {
    token1 = USDC_TOKEN;
  }
  return _tokenProviderUniLike(token0, token1, factoryAddress);
}

// export async function tokenProviderDyfn(
//   token0 = USDC_TOKEN,
//   token1 = WETH_TOKEN,
//   factoryAddress = DYFNSWAP_FACTORY
// ) {
//   if (token0 === WETH_TOKEN) {
//     token1 = USDC_TOKEN;
//   }
//   return _tokenProviderUniLike(token0, token1, factoryAddress);
// }

export async function _tokenProviderUniLike(
  token0: string,
  token1: string,
  factoryAddress: string
) {
  // Setup PoolProxy
  const factory = await ethers.getContractAt(
    'IUniswapV2Factory',
    factoryAddress
  );
  // const IUniswapV2Factory = artifacts.require('IUniswapV2Factory');
  // const factory = await IUniswapV2Factory.at(factoryAddress);
  const pair = await factory.callStatic.getPair(token0, token1);
  _impersonateAndInjectEther(pair);
  return await (ethers as any).getSigner(pair);
  // return pair;
}

// export async function tokenProviderCurveGauge(lpToken) {
//   // Get curve registry
//   const addressProvider = await ethers.getContractAt(
//     ['function get_registry() view returns (address)'],
//     CURVE_ADDRESS_PROVIDER
//   );
//   const registryAddress = await addressProvider.get_registry();

//   // Get curve gauge
//   const registry = await ethers.getContractAt(
//     [
//       'function get_pool_from_lp_token(address) view returns (address)',
//       'function get_gauges(address) view returns (address[10], int128[10])',
//     ],
//     registryAddress
//   );
//   const poolAddress = await registry.get_pool_from_lp_token(lpToken);
//   const gauges = await registry.get_gauges(poolAddress);

//   // Return non-zero gauge
//   let gauge;
//   for (const element of gauges[0]) {
//     if (element != ZERO_ADDRESS) {
//       gauge = element;
//       break;
//     }
//   }
//   _impersonateAndInjectEther(gauge);

//   return gauge;
// }

export async function _impersonateAndInjectEther(address: string) {
  // Impersonate pair
  await hre.network.provider.send('hardhat_impersonateAccount', [address]);

  // Inject 1 ether
  await hre.network.provider.send('hardhat_setBalance', [
    address,
    '0xde0b6b3a7640000',
  ]);
}

export async function sendEther(sender: Signer, to: string, value: BigNumber) {
  await sender.sendTransaction({
    to: to,
    value: value,
  });
}
