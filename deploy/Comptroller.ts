import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import {
  EXEC_FEE_COLLECTOR,
  PENDING_LIQUIDATOR,
  FUND_CREATORS,
  WL_AAVE_V2_SIGS,
  WL_FUNDS_SIGS,
  WL_QUICKSWAP_SIGS,
  WL_SUSHISWAP_SIGS,
  WL_CURVE_SIGS,
  WL_PARASWAP_V5_SIGS,
  WL_UNISWAP_V3_SIGS,
  LEVEL,
  LEVEL_AMOUNT,
  EXEC_FEE_PERCENTAGE,
  PENDING_EXPIRATION,
  VALUE_TOLERANCE,
  denominations,
  DS_PROXY_REGISTRY,
} from './Config';

import { assets, aaveV2Asset, aaveV2Debt, curveStable, quickSwap, sushiSwap } from './assets/AssetConfig';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const fundImplementation = await deployments.get('FundImplementation');
  const assetRouter = await deployments.get('AssetRouter');
  const execFeeCollector = EXEC_FEE_COLLECTOR;
  const execFeePercentage = EXEC_FEE_PERCENTAGE;
  const pendingLiquidator = PENDING_LIQUIDATOR;
  const pendingExpiration = PENDING_EXPIRATION;
  const mortgageVault = await deployments.get('MortgageVault');
  const valueTolerance = VALUE_TOLERANCE;
  const setupAction = await deployments.get('SetupAction');

  const resultImplementation = await deploy('ComptrollerImplementation', {
    from: deployer,
    log: true,
  });

  const comptrollerImplementation = await ethers.getContractAt(
    'ComptrollerImplementation',
    resultImplementation.address
  );

  const compData = comptrollerImplementation.interface.encodeFunctionData('initialize', [
    fundImplementation.address,
    assetRouter.address,
    execFeeCollector,
    execFeePercentage,
    pendingLiquidator,
    pendingExpiration,
    mortgageVault.address,
    valueTolerance,
    DS_PROXY_REGISTRY,
    setupAction.address,
  ]);

  const result = await deploy('ComptrollerProxy', {
    from: deployer,
    args: [comptrollerImplementation.address, compData],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log('executing "Comptroller" newly deployed setup');

    const comptroller = await ethers.getContractAt('ComptrollerImplementation', result.address);

    // Set mortgage tier
    await (await comptroller.setMortgageTier(LEVEL, LEVEL_AMOUNT)).wait();

    // Permit denomination and dust pair
    const mappedDenominations = Object.keys(denominations).map((denomination) => {
      const dust = denominations[denomination];
      return [denomination, dust] as const;
    });
    const denominationArray = mappedDenominations.map(([denomination]) => denomination);
    const dustArray = mappedDenominations.map(([, dust]) => dust);
    await (await comptroller.permitDenominations(denominationArray, dustArray)).wait();

    // Permit creator
    await (await comptroller.permitCreators(FUND_CREATORS)).wait();

    // Permit asset
    const assetArray = Object.values(assets);
    await (await comptroller.permitAssets(LEVEL, assetArray)).wait();

    // Permit aave v2 asset
    const aaveV2AssetArray = Object.values(aaveV2Asset);
    await (await comptroller.permitAssets(LEVEL, aaveV2AssetArray)).wait();

    // Permit aave v2 debt
    const aaveV2DebtArray = Object.values(aaveV2Debt);
    await (await comptroller.permitAssets(LEVEL, aaveV2DebtArray)).wait();

    // Permit curve stable
    const curveStableAddressArray = Object.values(curveStable).map((info) => {
      return info.address as string;
    });
    await (await comptroller.permitAssets(LEVEL, curveStableAddressArray)).wait();

    // Permit quickSwap
    const quickSwapArray = Object.values(quickSwap);
    await (await comptroller.permitAssets(LEVEL, quickSwapArray)).wait();

    // Permit sushiSwap
    const sushiSwapArray = Object.values(sushiSwap);
    await (await comptroller.permitAssets(LEVEL, sushiSwapArray)).wait();

    // Permit handler
    const hAaveProtocolV2 = await deployments.get('HAaveProtocolV2');
    const hFunds = await deployments.get('HFunds');
    const hQuickSwap = await deployments.get('HQuickSwap');
    const hSushiSwap = await deployments.get('HSushiSwap');
    const hCurve = await deployments.get('HCurve');
    const hParaSwapV5 = await deployments.get('HParaSwapV5');
    const hUniswapV3 = await deployments.get('HUniswapV3');
    const wlAddressList = [
      ...Array(WL_AAVE_V2_SIGS.length).fill(hAaveProtocolV2.address),
      ...Array(WL_FUNDS_SIGS.length).fill(hFunds.address),
      ...Array(WL_QUICKSWAP_SIGS.length).fill(hQuickSwap.address),
      ...Array(WL_SUSHISWAP_SIGS.length).fill(hSushiSwap.address),
      ...Array(WL_CURVE_SIGS.length).fill(hCurve.address),
      ...Array(WL_PARASWAP_V5_SIGS.length).fill(hParaSwapV5.address),
      ...Array(WL_UNISWAP_V3_SIGS.length).fill(hUniswapV3.address),
    ];
    const wlSigList = [
      ...WL_AAVE_V2_SIGS,
      ...WL_FUNDS_SIGS,
      ...WL_QUICKSWAP_SIGS,
      ...WL_SUSHISWAP_SIGS,
      ...WL_CURVE_SIGS,
      ...WL_PARASWAP_V5_SIGS,
      ...WL_UNISWAP_V3_SIGS,
    ];
    await (await comptroller.permitHandlers(LEVEL, wlAddressList, wlSigList)).wait();
  }
};

export default func;

func.tags = ['Comptroller'];
func.dependencies = [
  'FundImplementation',
  'AssetRouter',
  'MortgageVault',
  'SetupAction',
  'HAaveProtocolV2',
  'HFunds',
  'HQuickSwap',
  'HSushiSwap',
  'HCurve',
  'HParaSwapV5',
  'HUniswapV3',
];
