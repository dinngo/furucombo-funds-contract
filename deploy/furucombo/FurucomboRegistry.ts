import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  AAVE_LENDING_POOL,
  CURVE_AAVE_SWAP,
  CURVE_REN_SWAP,
  CURVE_ATRICRYPTO3_DEPOSIT,
  CURVE_EURTUSD_DEPOSIT,
} from '../Config';

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

    const registry = await ethers.getContractAt('FurucomboRegistry', result.address);

    // Register handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    const hCurve = await deployments.get('HCurve');
    const hParaSwapV5 = await deployments.get('HParaSwapV5');

    await registry.register(hAaveProtocolV2.address, ethers.utils.formatBytes32String('HAaveProtocolV2'));
    await registry.register(hFunds.address, ethers.utils.formatBytes32String('HFunds'));
    await registry.register(hQuickSwap.address, ethers.utils.formatBytes32String('HQuickSwap'));
    await registry.register(hSushiSwap.address, ethers.utils.formatBytes32String('HSushiSwap'));
    await registry.register(hCurve.address, ethers.utils.formatBytes32String('HCurve'));
    await registry.register(hParaSwapV5.address, ethers.utils.formatBytes32String('HParaSwapV5'));

    // Register caller
    await registry.registerCaller(
      AAVE_LENDING_POOL,
      ethers.utils.hexConcat([hAaveProtocolV2.address, '0x000000000000000000000000'])
    );

    // Set HCurve callee
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_AAVE_SWAP);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_REN_SWAP);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_ATRICRYPTO3_DEPOSIT);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_EURTUSD_DEPOSIT);
  }
};

export default func;

func.tags = ['FurucomboRegistry'];
func.dependencies = ['HAaveProtocolV2', 'HFunds', 'HQuickSwap', 'HSushiSwap', 'HCurve', 'HParaSwapV5'];
