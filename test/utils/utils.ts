import { BigNumber } from '@ethersproject/bignumber';
import { ethers } from 'hardhat';
import { RecordActionResultSig, DeltaGasSig } from './constants';
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
  const returnData = await proxy.callStatic.execute(
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
  const returnData = await proxy.callStatic.execute(
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
