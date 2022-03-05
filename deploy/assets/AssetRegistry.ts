import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  assets,
  aaveV2Asset,
  aaveV2Debt,
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
    const assetRegistry = await ethers.getContractAt(
      'AssetRegistry',
      result.address
    );

    // Register to canonical resolver
    const rCanonical = await deployments.get('RCanonical');
    for (const address of Object.values(assets)) {
      await assetRegistry.register(address, rCanonical.address);
    }

    // Register to aave v2 asset resolver
    const rAaveV2Asset = await deployments.get('RAaveProtocolV2Asset');
    for (const address of Object.values(aaveV2Asset)) {
      await assetRegistry.register(address, rAaveV2Asset.address);
    }

    // Register to aave v2 debt resolver
    const rAaveProtocolV2Debt = await deployments.get('RAaveProtocolV2Debt');
    for (const address of Object.values(aaveV2Debt)) {
      await assetRegistry.register(address, rAaveProtocolV2Debt.address);
    }

    // Register to curve stable resolver
    const rCurveStable = await deployments.get('RCurveStable');
    for (const info of Object.values(curveStable)) {
      await assetRegistry.register(info.address, rCurveStable.address);

      // Set pool info for lp token
      const rCurveStableInstance = await ethers.getContractAt(
        'RCurveStable',
        rCurveStable.address
      );
      await rCurveStableInstance.setPoolInfo(
        info.address,
        info.pool,
        info.valuedAsset,
        info.valuedAssetDecimals
      );
    }

    // Register to uniswap v2 like resolver
    const rUniSwapV2Like = await deployments.get('RUniSwapV2Like');
    for (const address of Object.values(quickSwap)) {
      await assetRegistry.register(address, rUniSwapV2Like.address);
    }
    for (const address of Object.values(sushiSwap)) {
      await assetRegistry.register(address, rUniSwapV2Like.address);
    }
  }
};

export default func;

func.tags = ['AssetRegistry'];
func.dependencies = [
  'RAaveProtocolV2Asset',
  'RAaveProtocolV2Debt',
  'RCanonical',
  'RCurveStable',
  'RUniSwapV2Like',
];
