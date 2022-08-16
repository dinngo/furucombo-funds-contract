import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { aaveV3Asset } from '../AssetConfig';

// beta parameter
const registryOwner = '0x64585922a9703d9EdE7d353a6522eb2970f75066';
const registryAddress = '0xE9a65dA3ac8599fda56Ec7e5c39467401078753b';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers, network } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('RAaveProtocolV3Asset', {
    from: deployer,
    args: [],
    log: true,
  });

  // Local network will dependencies by AssetRegistry to register asset resolver
  if (network.name == 'beta' && result.newlyDeployed) {
    console.log('executing "RAaveProtocolV3Asset" newly deployed setup');
    const rAaveV3Asset = await ethers.getContractAt('RAaveProtocolV3Asset', result.address);
    const assetRegistry = await ethers.getContractAt('AssetRegistry', registryAddress);

    const provider = ethers.provider;
    const [signer] = await ethers.getSigners();

    // Register to aave v3 asset resolver
    var nonce = await provider.getTransactionCount(registryOwner);
    for (const address of Object.values(aaveV3Asset)) {
      const registerData = assetRegistry.interface.encodeFunctionData('register', [address, rAaveV3Asset.address]);
      const registerCustomData = registerData + 'ff00ff' + registryOwner.replace('0x', '');
      await signer.sendTransaction({
        to: registryAddress,
        nonce: nonce++,
        data: registerCustomData,
        gasLimit: 6000000,
      });
      console.log('register asset', address, 'resolver');
    }
  }
};

export default func;

func.tags = ['RAaveProtocolV3Asset'];
