import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { assets, chainlinkAggregators } from './Config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();

  const result = await deploy('Chainlink', {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    const chainlink = await ethers.getContractAt('Chainlink', result.address);
    const pairs = Object.keys(assets).map((key) => {
      if (!chainlinkAggregators[key]) {
        throw new Error(`${key} aggregator is not found`);
      }

      const asset = assets[key];
      const aggregator = chainlinkAggregators[key];
      return [asset, aggregator] as const;
    });
    const assetArray = pairs.map(([asset]) => asset);
    const aggregatorArray = pairs.map(([, aggregator]) => aggregator);

    await chainlink.addAssets(assetArray, aggregatorArray);
  }
};

export default func;

func.tags = ['Chainlink'];
