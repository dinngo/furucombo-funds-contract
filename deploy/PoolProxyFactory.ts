import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const comptrollerImplementation = await deployments.get(
    'ComptrollerImplementation'
  );
  await deploy('PoolProxyFactory', {
    from: deployer,
    args: [comptrollerImplementation.address],
    log: true,
  });
};

export default func;

func.tags = ['PoolProxyFactory'];
func.dependencies = ['ComptrollerImplementation'];
