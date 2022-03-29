import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const comptrollerProxy = await deployments.get('ComptrollerProxy');
  await deploy('FundProxyFactory', {
    from: deployer,
    args: [comptrollerProxy.address],
    log: true,
  });
};

export default func;

func.tags = ['FundProxyFactory'];
func.dependencies = ['Comptroller'];
