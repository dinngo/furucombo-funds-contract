import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const owner = deployer;
  const furucomboProxy = await deployments.get('FurucomboProxy');
  const comptroller = await deployments.get('Comptroller');
  await deploy('AFurucombo', {
    from: deployer,
    args: [owner, furucomboProxy.address, comptroller.address],
    log: true,
  });
};

export default func;

func.tags = ['AFurucombo'];
func.dependencies = ['FurucomboProxy', 'Comptroller'];
