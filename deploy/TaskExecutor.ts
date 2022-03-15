import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const owner = deployer;
  const comptrollerImplementation = await deployments.get(
    'ComptrollerImplementation'
  );
  await deploy('TaskExecutor', {
    from: deployer,
    args: [owner, comptrollerImplementation.address],
    log: true,
  });
};

export default func;

func.tags = ['TaskExecutor'];
func.dependencies = ['ComptrollerImplementation'];
