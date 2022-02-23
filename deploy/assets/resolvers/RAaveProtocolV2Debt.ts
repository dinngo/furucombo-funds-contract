import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('RAaveProtocolV2Debt', {
    from: deployer,
    args: [],
    log: true,
  });
};

export default func;

func.tags = ['RAaveProtocolV2Debt'];
