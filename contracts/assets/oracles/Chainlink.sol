// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IAssetOracle} from "../interfaces/IAssetOracle.sol";
import {IChainlinkAggregatorV3} from "../interfaces/IChainlinkAggregatorV3.sol";

contract Chainlink is IAssetOracle, Ownable {
    uint256 public stalePeriod;

    mapping(address => address) public assetToAggregator;

    event StalePeriodUpdated(uint256 period);
    event AssetAdded(address indexed asset, address aggregator);
    event AssetRemoved(address indexed asset);

    constructor() {
        stalePeriod = 1 days;
    }

    /// @notice Calculate quote amount given the base amount.
    /// @param base The base asset address.
    /// @param baseAmount The base asset amount.
    /// @param quote The quote asset address.
    /// @return The quote asset amount.
    function calcConversionAmount(
        address base,
        uint256 baseAmount,
        address quote
    ) external view returns (uint256) {
        require(baseAmount > 0, "Zero amount");

        uint256 baseUnit = 10**uint256(IERC20Metadata(base).decimals());
        uint256 quoteUnit = 10**uint256(IERC20Metadata(quote).decimals());
        uint256 basePrice = _getChainlinkPrice(assetToAggregator[base]);
        uint256 quotePrice = _getChainlinkPrice(assetToAggregator[quote]);

        return (baseAmount * basePrice * quoteUnit) / (baseUnit * quotePrice);
    }

    function setStalePeriod(uint256 _stalePeriod) external onlyOwner {
        stalePeriod = _stalePeriod;
        emit StalePeriodUpdated(_stalePeriod);
    }

    /// @notice Add assets with the corresponding aggregators.
    /// @param assets The asset list to be supported.
    /// @param aggregators The corresponding chainlink aggregator list.
    /// @dev All aggregators should have the same quote and decimals.
    function addAssets(
        address[] calldata assets,
        address[] calldata aggregators
    ) external onlyOwner {
        require(assets.length == aggregators.length, "Invalid length");

        for (uint256 i; i < assets.length; i++) {
            require(
                assets[i] != address(0) && aggregators[i] != address(0),
                "Zero address"
            );
            require(
                assetToAggregator[assets[i]] == address(0),
                "Existing asset"
            );

            _getChainlinkPrice(aggregators[i]); // Try it out
            assetToAggregator[assets[i]] = aggregators[i];

            emit AssetAdded(assets[i], aggregators[i]);
        }
    }

    /// @notice Remove assets.
    /// @param assets The asset list to be removed.
    function removeAssets(address[] calldata assets) external onlyOwner {
        for (uint256 i; i < assets.length; i++) {
            require(
                assetToAggregator[assets[i]] != address(0),
                "Non-existent asset"
            );
            delete assetToAggregator[assets[i]];

            emit AssetRemoved(assets[i]);
        }
    }

    /// @notice Get chainlink data.
    /// @param aggregator The chainlink aggregator address.
    function _getChainlinkPrice(address aggregator)
        private
        view
        returns (uint256)
    {
        require(aggregator != address(0), "Zero address");

        (, int256 price, , uint256 updatedAt, ) = IChainlinkAggregatorV3(
            aggregator
        ).latestRoundData();

        require(price > 0, "Invalid price");
        require(updatedAt >= block.timestamp - stalePeriod, "Stale price");

        return uint256(price);
    }
}
