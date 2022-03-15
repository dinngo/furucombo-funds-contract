import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { WL_ANY_SIG, LEVEL, denominations } from './Config';
import { assets } from './assets/AssetConfig';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();
  const comptrollerAddress = (await deployments.get('Comptroller')).address;
  const comptroller = await ethers.getContractAt(
    'Comptroller',
    comptrollerAddress
  );

  // Set task executor
  const taskExecutor = await deployments.get('TaskExecutor');
  await comptroller.setExecAction(taskExecutor.address);

  // Permit denomination
  const mappedDenominations = Object.keys(denominations).map((denomination) => {
    const dust = denominations[denomination];
    return [denomination, dust] as const;
  });
  const denominationArray = mappedDenominations.map(
    ([denomination]) => denomination
  );
  const dustArray = mappedDenominations.map(([, dust]) => dust);
  await comptroller.permitDenominations(denominationArray, dustArray);

  // Permit creator
  await comptroller.permitCreators([deployer]);

  // Permit asset
  const mappedAssets = Object.keys(assets).map((key) => {
    return [assets[key]] as const;
  });
  const assetArray = mappedAssets.map(([asset]) => asset);
  await comptroller.permitAssets(LEVEL, assetArray);

  // Permit delegate call
  const aFurucombo = await deployments.get('AFurucombo');
  await comptroller.permitDelegateCalls(
    LEVEL,
    [aFurucombo.address],
    [WL_ANY_SIG]
  );

  // Permit handler
  const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
  const hFunds = await deployments.get('HFunds');
  const hQuickSwap = await deployments.get('HQuickSwap');
  const hSushiSwap = await deployments.get('HSushiSwap');
  const hCurve = await deployments.get('HCurve');
  await comptroller.permitHandlers(
    LEVEL,
    [
      hAaveProtocolV2.address,
      hFunds.address,
      hQuickSwap.address,
      hSushiSwap.address,
      hCurve.address,
    ],
    [WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG, WL_ANY_SIG]
  );
};

export default func;

func.tags = ['ComptrollerSetup'];
func.dependencies = [
  'Comptroller',
  'TaskExecutor',
  'AFurucombo',
  'HAaveProtocolV2',
  'HFunds',
  'HQuickSwap',
  'HSushiSwap',
  'HCurve',
];
