import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { constants } from 'ethers';
import { MANAGEMENT, WL_ANY_SIG, LEVEL } from './Config';

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

  // Transfer comptroller's ownership who can configures settings
  await comptrollerProxy.transferOwnership(MANAGEMENT);

  // Transfer comptroller admin's ownership who can update comptroller implementation
  const adminSlot = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'; // uint256(keccak256("eip1967.proxy.admin")) - 1
  const adminAddress = '0x' + (await ethers.provider.getStorageAt(comptrollerProxy.address, adminSlot)).substring(26); // remove leading 0x000...000
  const comptrollerProxyAdmin = await ethers.getContractAt('ComptrollerProxyAdmin', adminAddress);
  await comptrollerProxyAdmin.transferOwnership(MANAGEMENT);

  // Transfer beacon ownership who can update fund implementation
  const beaconAddress = await comptrollerProxy.beacon();
  const beacon = await ethers.getContractAt('UpgradeableBeacon', beaconAddress);
  await beacon.transferOwnership(MANAGEMENT);
};

export default func;

func.tags = ['ComptrollerPostSetup'];
func.dependencies = ['Comptroller', 'TaskExecutor', 'AFurucombo'];
