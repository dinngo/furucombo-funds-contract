import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MORTGAGE_TOKEN } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('MortgageVault', {
    from: deployer,
    args: [MORTGAGE_TOKEN],
    log: true,
  });
};

export default func;

func.tags = ['MortgageVault'];
