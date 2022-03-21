// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Errors} from "../../utils/Errors.sol";
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
        Errors._require(baseAmount > 0, Errors.Code.CHAINLINK_ZERO_AMOUNT);

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
        Errors._require(
            assets.length == aggregators.length,
            Errors.Code.CHAINLINK_ASSETS_AND_AGGREGATORS_INCONSISTENT
        );

        for (uint256 i; i < assets.length; i++) {
            Errors._require(
                assets[i] != address(0) && aggregators[i] != address(0),
                Errors.Code.CHAINLINK_ZERO_ADDRESS
            );
            Errors._require(
                assetToAggregator[assets[i]] == address(0),
                Errors.Code.CHAINLINK_EXISTING_ASSET
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
            Errors._require(
                assetToAggregator[assets[i]] != address(0),
                Errors.Code.CHAINLINK_NON_EXISTENT_ASSET
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
        Errors._require(
            aggregator != address(0),
            Errors.Code.CHAINLINK_ZERO_ADDRESS
        );

        (, int256 price, , uint256 updatedAt, ) = IChainlinkAggregatorV3(
            aggregator
        ).latestRoundData();

        Errors._require(price > 0, Errors.Code.CHAINLINK_INVALID_PRICE);
        Errors._require(
            updatedAt >= block.timestamp - stalePeriod,
            Errors.Code.CHAINLINK_STALE_PRICE
        );

        return uint256(price);
    }
}
