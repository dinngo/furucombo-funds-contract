import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MANAGEMENT } from '../../Config';
import { curveStable } from '../AssetConfig';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('RCurveStable', {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "RCurveStable" newly deployed setup');

    const rCurveStable = await ethers.getContractAt('RCurveStable', result.address);

    for (const info of Object.values(curveStable)) {
      // Set pool info for lp token
      await (
        await rCurveStable.setPoolInfo(info.address, info.pool, info.valuedAsset, info.valuedAssetDecimals)
      ).wait();
    }

    // Transfer ownership
    await (await rCurveStable.transferOwnership(MANAGEMENT)).wait();
  }
};

export default func;

func.tags = ['RCurveStable'];
