import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { constants } from 'ethers';
import { WL_ANY_SIG, LEVEL } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('executing "ComptrollerPostSetup"');

  const { deployments, ethers } = hre;
  const comptrollerAddress = (await deployments.get('ComptrollerProxy')).address;
  const comptrollerProxy = await ethers.getContractAt('ComptrollerImplementation', comptrollerAddress);

  // Set task executor
  const execAction = await comptrollerProxy.execAction();
  if (execAction === constants.AddressZero) {
    const taskExecutor = await deployments.get('TaskExecutor');
    await comptrollerProxy.setExecAction(taskExecutor.address);
  }

  // Permit delegate call
  const aFurucombo = await deployments.get('AFurucombo');
  const canCall = await comptrollerProxy.canDelegateCall(LEVEL, aFurucombo.address, WL_ANY_SIG);
  if (!canCall) {
    await comptrollerProxy.permitDelegateCalls(LEVEL, [aFurucombo.address], [WL_ANY_SIG]);
  }
};

export default func;

func.tags = ['ComptrollerPostSetup'];
func.dependencies = ['Comptroller', 'TaskExecutor', 'AFurucombo'];
