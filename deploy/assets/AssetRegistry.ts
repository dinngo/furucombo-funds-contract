import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MANAGEMENT } from '../Config';
import {
  assets,
  aaveV2Asset,
  aaveV2Debt,
  aaveV3Asset,
  aaveV3Debt,
  curveStable,
  quickSwap,
  sushiSwap,
} from './AssetConfig';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('AssetRegistry', {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "AssetRegistry" newly deployed setup');

    const assetRegistry = await ethers.getContractAt('AssetRegistry', result.address);

    // Register to canonical resolver
    const rCanonical = await deployments.get('RCanonical');
    for (const address of Object.values(assets)) {
      await (await assetRegistry.register(address, rCanonical.address)).wait();
    }

    // Register to aave v2 asset resolver
    const rAaveV2Asset = await deployments.get('RAaveProtocolV2Asset');
    for (const address of Object.values(aaveV2Asset)) {
      await (await assetRegistry.register(address, rAaveV2Asset.address)).wait();
    }

    // Register to aave v2 debt resolver
    const rAaveProtocolV2Debt = await deployments.get('RAaveProtocolV2Debt');
    for (const address of Object.values(aaveV2Debt)) {
      await (await assetRegistry.register(address, rAaveProtocolV2Debt.address)).wait();
    }

    // Register to aave v3 asset resolver
    const rAaveV3Asset = await deployments.get('RAaveProtocolV3Asset');
    for (const address of Object.values(aaveV3Asset)) {
      await (await assetRegistry.register(address, rAaveV3Asset.address)).wait();
    }

    // Register to aave v3 debt resolver
    const rAaveProtocolV3Debt = await deployments.get('RAaveProtocolV3Debt');
    for (const address of Object.values(aaveV3Debt)) {
      await (await assetRegistry.register(address, rAaveProtocolV3Debt.address)).wait();
    }

    // Register to curve stable resolver
    const rCurveStable = await deployments.get('RCurveStable');
    for (const info of Object.values(curveStable)) {
      await (await assetRegistry.register(info.address, rCurveStable.address)).wait();
    }

    // Register to uniswap v2 like resolver
    const rUniSwapV2Like = await deployments.get('RUniSwapV2Like');
    for (const address of Object.values(quickSwap)) {
      await (await assetRegistry.register(address, rUniSwapV2Like.address)).wait();
    }
    for (const address of Object.values(sushiSwap)) {
      await (await assetRegistry.register(address, rUniSwapV2Like.address)).wait();
    }

    // Transfer ownership
    await assetRegistry.transferOwnership(MANAGEMENT);
  }
};

export default func;

func.tags = ['AssetRegistry'];
func.dependencies = [
  'RAaveProtocolV2Asset',
  'RAaveProtocolV2Debt',
  'RAaveProtocolV3Asset',
  'RAaveProtocolV3Debt',
  'RCanonical',
  'RCurveStable',
  'RUniSwapV2Like',
];
