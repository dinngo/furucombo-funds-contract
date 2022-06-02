import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MANAGEMENT } from '../Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainlink = await deployments.get('Chainlink');
  const assetRegistry = await deployments.get('AssetRegistry');
  const result = await deploy('AssetRouter', {
    from: deployer,
    args: [chainlink.address, assetRegistry.address],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "AssetRouter" newly deployed setup');

    const assetRouter = await ethers.getContractAt('AssetRouter', result.address);

    // Transfer ownership
    await (await assetRouter.transferOwnership(MANAGEMENT)).wait();
  }
};

export default func;

func.tags = ['AssetRouter'];
func.dependencies = ['Chainlink', 'AssetRegistry'];
