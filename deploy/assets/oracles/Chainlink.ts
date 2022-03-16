import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { chainlinkAggregators } from '../AssetConfig';

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
    console.log('executing "Chainlink" newly deployed setup');

    const chainlink = await ethers.getContractAt('Chainlink', result.address);

    // Add asset and aggregator pairs
    const pairs = Object.keys(chainlinkAggregators).map((asset) => {
      return [asset, chainlinkAggregators[asset]] as const;
    });
    const assetArray = pairs.map(([asset]) => asset);
    const aggregatorArray = pairs.map(([, aggregator]) => aggregator);
    await chainlink.addAssets(assetArray, aggregatorArray);
  }
};

export default func;

func.tags = ['Chainlink'];
