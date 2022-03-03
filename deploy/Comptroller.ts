import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { EXEC_FEE_PERCENTAGE, PENDING_EXPIRATION } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const implementation = await deployments.get('Implementation');
  const assetRouter = await deployments.get('AssetRouter');
  const execFeeCollector = deployer;
  const execFeePercentage = EXEC_FEE_PERCENTAGE;
  const pendingLiquidator = deployer;
  const pendingExpiration = PENDING_EXPIRATION;
  const mortgageVault = await deployments.get('MortgageVault');
  await deploy('Comptroller', {
    from: deployer,
    args: [
      implementation.address,
      assetRouter.address,
      execFeeCollector,
      execFeePercentage,
      pendingLiquidator,
      pendingExpiration,
      mortgageVault.address,
    ],
    log: true,
  });
};

export default func;

func.tags = ['Comptroller'];
func.dependencies = ['Implementation', 'AssetRouter', 'MortgageVault'];
