import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { constants } from 'ethers';
import { WL_ANY_SIG, LEVEL } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  console.log('executing "ComptrollerPostSetup"');

  const { deployments, ethers } = hre;
  const comptrollerAddress = (
    await deployments.get('ComptrollerImplementation')
  ).address;
  const comptrollerImplementation = await ethers.getContractAt(
    'ComptrollerImplementation',
    comptrollerAddress
  );

  // Set task executor
  const execAction = await comptrollerImplementation.execAction();
  if (execAction === constants.AddressZero) {
    const taskExecutor = await deployments.get('TaskExecutor');
    await comptrollerImplementation.setExecAction(taskExecutor.address);
  }

  // Permit delegate call
  const aFurucombo = await deployments.get('AFurucombo');
  const canCall = await comptrollerImplementation.canDelegateCall(
    LEVEL,
    aFurucombo.address,
    WL_ANY_SIG
  );
  if (!canCall) {
    await comptrollerImplementation.permitDelegateCalls(
      LEVEL,
      [aFurucombo.address],
      [WL_ANY_SIG]
    );
  }
};

export default func;

func.tags = ['ComptrollerPostSetup'];
func.dependencies = ['ComptrollerImplementation', 'TaskExecutor', 'AFurucombo'];
