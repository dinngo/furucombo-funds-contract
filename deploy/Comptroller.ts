import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  FURUCOMBO_HCURVE,
  WL_ANY_SIG,
  LEVEL,
  EXEC_FEE_PERCENTAGE,
  PENDING_EXPIRATION,
  VALUE_TOLERANCE,
  denominations,
} from './Config';
import {
  assets,
  aaveV2Asset,
  aaveV2Debt,
  curveStable,
  quickSwap,
  sushiSwap,
} from './assets/AssetConfig';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const poolImplementation = await deployments.get('PoolImplementation');
  const assetRouter = await deployments.get('AssetRouter');
  const execFeeCollector = deployer;
  const execFeePercentage = EXEC_FEE_PERCENTAGE;
  const pendingLiquidator = deployer;
  const pendingExpiration = PENDING_EXPIRATION;
  const mortgageVault = await deployments.get('MortgageVault');
  const valueTolerance = VALUE_TOLERANCE;

  const result = await deploy('ComptrollerImplementation', {
    from: deployer,
    log: true,
  });
  /*
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
      valueTolerance,
    ],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "Comptroller" newly deployed setup');

    const comptroller = await ethers.getContractAt(
      'Comptroller',
      result.address
    );

    // Permit denomination and dust pair
    const mappedDenominations = Object.keys(denominations).map(
      (denomination) => {
        const dust = denominations[denomination];
        return [denomination, dust] as const;
      }
    );
    const denominationArray = mappedDenominations.map(
      ([denomination]) => denomination
    );
    const dustArray = mappedDenominations.map(([, dust]) => dust);
    await comptroller.permitDenominations(denominationArray, dustArray);

    // Permit creator
    await comptroller.permitCreators([deployer]);

    // Permit asset
    const assetArray = Object.values(assets);
    await comptroller.permitAssets(LEVEL, assetArray);

    // Permit aave v2 asset
    const aaveV2AssetArray = Object.values(aaveV2Asset);
    await comptroller.permitAssets(LEVEL, aaveV2AssetArray);

    // Permit aave v2 debt
    const aaveV2DebtArray = Object.values(aaveV2Debt);
    await comptroller.permitAssets(LEVEL, aaveV2DebtArray);

    // Permit curve stable
    const curveStableAddressArray = Object.values(curveStable).map((info) => {
      return info.address as string;
    });
    await comptroller.permitAssets(LEVEL, curveStableAddressArray);

    // Permit quickSwap
    const quickSwapArray = Object.values(quickSwap);
    await comptroller.permitAssets(LEVEL, quickSwapArray);

    // Permit sushiSwap
    const sushiSwapArray = Object.values(sushiSwap);
    await comptroller.permitAssets(LEVEL, sushiSwapArray);

    // Permit handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    await comptroller.permitHandlers(
      LEVEL,
      [
        hAaveProtocolV2.address,
        hFunds.address,
        hQuickSwap.address,
        hSushiSwap.address,
        FURUCOMBO_HCURVE,
      ],
      [WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG]
    );
  }
  */
};

export default func;

func.tags = ['Comptroller'];
func.dependencies = [
  'PoolImplementation',
  'AssetRouter',
  'MortgageVault',
  'HAaveProtocolV2',
  'HFunds',
  'HQuickSwap',
  'HSushiSwap',
];
