import { expect } from 'chai';
import { BigNumber, Signer, constants } from 'ethers';
import { BigNumber as BigNumberJs } from 'bignumber.js';
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
  CURVE_ADDRESS_PROVIDER,
} from './constants';
const hre = require('hardhat');

export async function profileGas(receipt: any) {
  const result = await receipt.wait();

  result.events.forEach((element: any) => {
    if (element.topics[0] === DeltaGasSig) {
      const [tag, gas] = ethers.utils.defaultAbiCoder.decode(['bytes32', 'uint256'], element.data);
      console.log(ethers.utils.toUtf8String(tag) + ': ' + gas.toString());
    }
  });
}

export function expectEqWithinBps(actual: BigNumber, expected: BigNumber, bps: number = 1, exponent: number = 4) {
  const base = BigNumber.from(10).pow(exponent);
  const upper = expected.mul(base.add(BigNumber.from(bps))).div(base);
  const lower = expected.mul(base.sub(BigNumber.from(bps))).div(base);
  expect(actual).to.be.lte(upper);
  expect(actual).to.be.gte(lower);
}

export function get64x64FromNumber(a: number): BigNumber {
  return get64x64FromBig(new BigNumberJs(a));
}

export function get64x64FromBig(a: BigNumberJs): BigNumber {
  const BASE64x64 = new BigNumberJs(2).pow(64);
  return BigNumber.from(a.times(BASE64x64).toFixed(0, 1).toString());
}

export function ether(num: any) {
  return ethers.utils.parseUnits(num, 'ether');
}

export function mwei(num: any) {
  return ethers.utils.parseUnits(num, 6);
}

export async function getTaskExecutorAssetQuotas(proxy: any, taskExecutor: any, tokensIn: string[]) {
  const returnData = await proxy.callStatic.executeMock(
    taskExecutor.address,
    getCallData(taskExecutor, 'getAssetQuotas', [tokensIn])
  );

  const assetQuotas = ethers.utils.defaultAbiCoder.decode(['uint256[]'], returnData)[0];
  return assetQuotas;
}

export async function getTaskExecutorDealingAssets(proxy: any, taskExecutor: any) {
  const returnData = await proxy.callStatic.executeMock(
    taskExecutor.address,
    getCallData(taskExecutor, 'getDealingAssetList', [])
  );

  const assets = ethers.utils.defaultAbiCoder.decode(['address[]'], returnData)[0];
  return assets;
}

export function getCallData(artifact: any, name: string, params: any) {
  return artifact.interface.encodeFunctionData(name, params);
}

export function getCallActionData(ethValue: any, artifact: any, funcName: string, params: any) {
  return ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [ethValue, getCallData(artifact, funcName, params)]);
}

export async function impersonateAndInjectEther(address: string) {
  _impersonateAndInjectEther(address);
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
      const bytesData = ethers.utils.defaultAbiCoder.decode(['bytes'], element.data)[0];

      actionResult = ethers.utils.defaultAbiCoder.decode(dataTypes, bytesData)[0];
    }
  });
  return actionResult;
}

export async function getHandlerReturn(receipt: any, dataTypes: any) {
  let actionResult: any;
  const result = await receipt.wait();

  result.events.forEach((element: any) => {
    if (element.topics[0] === RecordHandlerResultSig) {
      const bytesData = ethers.utils.defaultAbiCoder.decode(['bytes'], element.data)[0];

      actionResult = ethers.utils.defaultAbiCoder.decode(dataTypes, bytesData);
    }
  });
  return actionResult;
}

export async function getEventArgs(receipt: any, event: string) {
  let args: any;
  const result = await receipt.wait();
  result.events.forEach((element: any) => {
    if (element.event === event) {
      args = element.args;
    }
  });

  return args;
}

export function asciiToHex32(s: string) {
  // Right Pad
  return ethers.utils.formatBytes32String(s);
}

export async function balanceDelta(addr: string, b: BigNumber) {
  return (await ethers.provider.getBalance(addr)).sub(b);
}

export function getFuncSig(artifact: any, name: string) {
  return artifact.interface.getSighash(name);
}

export async function tokenProviderQuick(token0 = USDC_TOKEN, token1 = WETH_TOKEN, factoryAddress = QUICKSWAP_FACTORY) {
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

export async function tokenProviderSushi(token0 = USDC_TOKEN, token1 = WETH_TOKEN, factoryAddress = SUSHISWAP_FACTORY) {
  if (token0 === WETH_TOKEN) {
    token1 = USDC_TOKEN;
  }
  return _tokenProviderUniLike(token0, token1, factoryAddress);
}

export async function tokenProviderCurveGauge(lpToken: string) {
  // Get curve registry
  const addressProvider = await ethers.getContractAt(
    ['function get_registry() view returns (address)'],
    CURVE_ADDRESS_PROVIDER
  );
  const registryAddress = await addressProvider.get_registry();

  // Get curve gauge
  const registry = await ethers.getContractAt(
    [
      'function get_pool_from_lp_token(address) view returns (address)',
      'function get_gauges(address) view returns (address[10], int128[10])',
    ],
    registryAddress
  );
  const poolAddress = await registry.get_pool_from_lp_token(lpToken);
  const gauges = await registry.get_gauges(poolAddress);

  // Return non-zero gauge
  let gauge;
  for (const element of gauges[0]) {
    if (element != constants.AddressZero) {
      gauge = element;
      break;
    }
  }
  _impersonateAndInjectEther(gauge);

  return await (ethers as any).getSigner(gauge);
}

export async function _tokenProviderUniLike(token0: string, token1: string, factoryAddress: string) {
  const factory = await ethers.getContractAt('IUniswapV2Factory', factoryAddress);

  const pair = await factory.getPair(token0, token1);
  _impersonateAndInjectEther(pair);
  return await (ethers as any).getSigner(pair);
}

export async function _impersonateAndInjectEther(address: string) {
  // Impersonate pair
  await hre.network.provider.send('hardhat_impersonateAccount', [address]);

  // Inject 1 ether
  await hre.network.provider.send('hardhat_setBalance', [address, '0xde0b6b3a7640000']);
}

export async function sendEther(sender: Signer, to: string, value: BigNumber) {
  await sender.sendTransaction({
    to: to,
    value: value,
  });
}

export function mulPercent(num: any, percentage: any) {
  return BigNumber.from(num).mul(BigNumber.from(percentage)).div(BigNumber.from(100));
}

export function padRightZero(s: string, length: any) {
  for (let i = 0; i < length; i++) {
    s = s + '0';
  }
  return s;
}

export function calcSqrt(y: BigNumber) {
  let z = BigNumber.from(0);
  if (y.gt(3)) {
    z = y;
    let x = y.div(BigNumber.from(2)).add(BigNumber.from(1));
    while (x.lt(z)) {
      z = x;
      x = y.div(x).add(x).div(BigNumber.from(2));
    }
  } else if (!y.eq(0)) {
    z = BigNumber.from(1);
  }

  return z;
}

export async function latest() {
  return BigNumber.from((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
}

export async function getTimestampByTx(tx: any) {
  return BigNumber.from((await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp);
}

export function decimal6(amount: any) {
  return BigNumber.from(amount).mul(BigNumber.from('1000000'));
}

export function decimal6To18(amount: any) {
  return amount.mul(ether('1')).div(mwei('1'));
}

export function decimal18To6(amount: any) {
  return amount.mul(mwei('1')).div(ether('1'));
}

export async function increaseNextBlockTimeBy(interval: number) {
  const blockNumber = await ethers.provider.getBlockNumber();
  let block = null;
  for (let i = 0; block == null; i++) {
    block = await ethers.provider.getBlock(blockNumber - i);
  }
  const jsonRpc = new ethers.providers.JsonRpcProvider();
  await jsonRpc.send('evm_setNextBlockTimestamp', [block.timestamp + interval]);
  await jsonRpc.send('evm_mine', []);
}
