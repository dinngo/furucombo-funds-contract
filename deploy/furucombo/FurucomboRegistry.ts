import { readFileSync } from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  MANAGEMENT,
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

    const hash = '0x' + getGitHash().padEnd(64, '0');
    const registry = await ethers.getContractAt('FurucomboRegistry', result.address);

    // Register handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    const hCurve = await deployments.get('HCurve');
    const hParaSwapV5 = await deployments.get('HParaSwapV5');

    await registry.register(hAaveProtocolV2.address, hash);
    await registry.register(hFunds.address, hash);
    await registry.register(hQuickSwap.address, hash);
    await registry.register(hSushiSwap.address, hash);
    await registry.register(hCurve.address, hash);
    await registry.register(hParaSwapV5.address, hash);

    // Register caller
    await registry.registerCaller(AAVE_LENDING_POOL, hAaveProtocolV2.address.padEnd(66, '0'));

    // Set HCurve callee
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_AAVE_SWAP);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_REN_SWAP);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_ATRICRYPTO3_DEPOSIT);
    await registry.registerHandlerCalleeWhitelist(hCurve.address, CURVE_EURTUSD_DEPOSIT);

    // Transfer ownership
    await registry.transferOwnership(MANAGEMENT);
  }
};

function getGitHash(): string {
  const rev = readFileSync('.git/HEAD').toString().trim();
  if (rev.indexOf(':') === -1) {
    return rev;
  } else {
    return readFileSync('.git/' + rev.substring(5))
      .toString()
      .trim();
  }
}

export default func;

func.tags = ['FurucomboRegistry'];
func.dependencies = ['HAaveProtocolV2', 'HFunds', 'HQuickSwap', 'HSushiSwap', 'HCurve', 'HParaSwapV5'];
