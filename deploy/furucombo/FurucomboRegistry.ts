import { readFileSync } from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  MANAGEMENT,
  AAVE_LENDING_POOL,
  AAVE_POOL_V3,
  CURVE_AAVE_SWAP,
  CURVE_REN_SWAP,
  CURVE_ATRICRYPTO3_DEPOSIT,
  CURVE_EURTUSD_DEPOSIT,
} from '../Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('FurucomboRegistry', {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "Registry" newly deployed setup');

    const hash = '0x' + getGitHash().padEnd(64, '0');
    const registry = await ethers.getContractAt('FurucomboRegistry', result.address);

    // Register handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hAaveProtocolV3 = await deployments.get('HAaveProtocolV3');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    const hCurve = await deployments.get('HCurve');
    const hParaSwapV5 = await deployments.get('HParaSwapV5');
    const hUniswapV3 = await deployments.get('HUniswapV3');

    await (await registry.register(hAaveProtocolV2.address, hash)).wait();
    await (await registry.register(hAaveProtocolV3.address, hash)).wait();
    await (await registry.register(hFunds.address, hash)).wait();
    await (await registry.register(hQuickSwap.address, hash)).wait();
    await (await registry.register(hSushiSwap.address, hash)).wait();
    await (await registry.register(hCurve.address, hash)).wait();
    await (await registry.register(hParaSwapV5.address, hash)).wait();
    await (await registry.register(hUniswapV3.address, hash)).wait();

    // Register caller
    await (await registry.registerCaller(AAVE_LENDING_POOL, hAaveProtocolV2.address.padEnd(66, '0'))).wait();
    await (await registry.registerCaller(AAVE_POOL_V3, hAaveProtocolV3.address.padEnd(66, '0'))).wait();

    // Set HCurve callee
    await (await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_AAVE_SWAP)).wait();
    await (await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_REN_SWAP)).wait();
    await (await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_ATRICRYPTO3_DEPOSIT)).wait();
    await (await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_EURTUSD_DEPOSIT)).wait();

    // Transfer ownership
    await (await registry.transferOwnership(MANAGEMENT)).wait();
  }
};

function getGitHash(): string {
  const rev = readFileSync('.git/HEAD').toString().trim();
  if (rev.indexOf(':') === -1) {
    return rev;
  } else {
    return readFileSync('.git/' + rev.substring(5))
      .toString()
      .trim();
  }
}

export default func;

func.tags = ['FurucomboRegistry'];
func.dependencies = [
  'HAaveProtocolV2',
  'HAaveProtocolV3',
  'HFunds',
  'HQuickSwap',
  'HSushiSwap',
  'HCurve',
  'HParaSwapV5',
  'HUniswapV3',
];
