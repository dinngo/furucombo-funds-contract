import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainlink = await deployments.get('Chainlink');
  const assetRegistry = await deployments.get('AssetRegistry');
  await deploy('AssetRouter', {
    from: deployer,
    args: [chainlink.address, assetRegistry.address],
    log: true,
  });
};

export default func;

func.tags = ['AssetRouter'];
func.dependencies = ['Chainlink', 'AssetRegistry'];
