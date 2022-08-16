import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import { LEVEL, WL_AAVE_V3_SIGS } from '../../Config';
import { aaveV3Asset, aaveV3Debt } from '../../assets/AssetConfig';

const AAVE_POOL_V3 = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

// beta parameter
const contractOwner = '0x64585922a9703d9EdE7d353a6522eb2970f75066';
const registryAddress = '0x32A5441F003b4ca3FD5a44aae3af9f756947D88B';
const comptrollerAddress = '0x24fdb881EfAaF200c29c7449fB16845cc081BAB7';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('HAaveProtocolV3', {
    from: deployer,
    args: [],
    log: true,
  });

  // Local network will dependencies by FurucomboRegistry to registry the register and caller
  if (network.name == 'beta' && result.newlyDeployed) {
    console.log('executing "HAaveProtocolV3" newly deployed setup');
    const hAaveProtocolV3 = await ethers.getContractAt('HAaveProtocolV3', result.address);
    const registry = await ethers.getContractAt('FurucomboRegistry', registryAddress);
    const comptroller = await ethers.getContractAt('ComptrollerImplementation', comptrollerAddress);

    // Register handler to Registry
    const registerData = registry.interface.encodeFunctionData('register', [
      hAaveProtocolV3.address,
      ethers.utils.formatBytes32String('HAaveProtocolV3'),
    ]);
    await _sendOwnerTransaction(registryAddress, registerData);
    console.log('registry HAaveProtocolV3 handler:', await registry.isValidHandler(hAaveProtocolV3.address));

    // registerCaller to Registry
    const registerCallerData = registry.interface.encodeFunctionData('registerCaller', [
      AAVE_POOL_V3,
      ethers.utils.formatBytes32String('HAaveProtocolV3'),
    ]);
    await _sendOwnerTransaction(registryAddress, registerCallerData);
    console.log('registry aave V3 pool caller:', await registry.isValidCaller(AAVE_POOL_V3));

    // Permit aave v3 asset
    const aaveV3AssetArray = Object.values(aaveV3Asset);
    const permitAssetDate = comptroller.interface.encodeFunctionData('permitAssets', [LEVEL, aaveV3AssetArray]);
    await _sendOwnerTransaction(comptrollerAddress, permitAssetDate);
    console.log('permit aave V3 asset to comptroller');

    // Permit aave v3 debt
    const aaveV3DebtArray = Object.values(aaveV3Debt);
    const permitDebtDate = comptroller.interface.encodeFunctionData('permitAssets', [LEVEL, aaveV3DebtArray]);
    await _sendOwnerTransaction(comptrollerAddress, permitDebtDate);
    console.log('permit aave V3 debt to comptroller');

    // Permit handler
    const wlAddressList = [...Array(WL_AAVE_V3_SIGS.length).fill(hAaveProtocolV3.address)];
    const wlSigList = [...WL_AAVE_V3_SIGS];
    const permitHandlerData = comptroller.interface.encodeFunctionData('permitHandlers', [
      LEVEL,
      wlAddressList,
      wlSigList,
    ]);
    await _sendOwnerTransaction(comptrollerAddress, permitHandlerData);
    console.log('permit aave V3 hander function to comptroller');
  }
};

async function _sendOwnerTransaction(to: string, data: string) {
  const [signer] = await ethers.getSigners();
  const nonce = await ethers.provider.getTransactionCount(contractOwner);
  const customData = data + 'ff00ff' + contractOwner.replace('0x', '');

  await (
    await signer.sendTransaction({
      to: to,
      nonce: nonce,
      data: customData,
      gasLimit: 6000000,
    })
  ).wait();
}

export default func;

func.tags = ['HAaveProtocolV3'];
