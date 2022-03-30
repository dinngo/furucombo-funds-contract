import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { AAVE_LENDING_POOL, CURVE_AAVE_SWAP } from '../Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const result = await deploy('FurucomboRegistry', {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "Registry" newly deployed setup');

    const registry = await ethers.getContractAt(
      'FurucomboRegistry',
      result.address
    );

    // Register handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    const hCurve = await deployments.get('HCurve');

    await registry.register(
      hAaveProtocolV2.address,
      ethers.utils.formatBytes32String('HAaveProtocolV2')
    );
    await registry.register(
      hFunds.address,
      ethers.utils.formatBytes32String('HFunds')
    );
    await registry.register(
      hQuickSwap.address,
      ethers.utils.formatBytes32String('HQuickSwap')
    );
    await registry.register(
      hSushiSwap.address,
      ethers.utils.formatBytes32String('HSushiSwap')
    );
    await registry.register(
      hCurve.address,
      ethers.utils.formatBytes32String('HCurve')
    );

    // Register caller
    await registry.registerCaller(
      AAVE_LENDING_POOL,
      ethers.utils.hexConcat([
        hAaveProtocolV2.address,
        '0x000000000000000000000000',
      ])
    );

    // Set HCurve callee
    await registry.registerHandlerCalleeWhitelist(
      hCurve.address,
      CURVE_AAVE_SWAP
    );
  }
};

export default func;

func.tags = ['FurucomboRegistry'];
func.dependencies = [
  'HAaveProtocolV2',
  'HFunds',
  'HQuickSwap',
  'HSushiSwap',
  'HCurve',
];
