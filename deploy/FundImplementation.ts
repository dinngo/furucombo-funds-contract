import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { DS_PROXY_REGISTRY } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('FundImplementation', {
    from: deployer,
    args: [DS_PROXY_REGISTRY],
    log: true,
  });
};

export default func;

func.tags = ['FundImplementation'];
