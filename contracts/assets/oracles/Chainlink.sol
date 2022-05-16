// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Errors} from "../../utils/Errors.sol";
import {IAssetOracle} from "../interfaces/IAssetOracle.sol";
import {IChainlinkAggregatorV3} from "../interfaces/IChainlinkAggregatorV3.sol";

/// @title Chainlink oracle
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
    /// @param base_ The base asset address.
    /// @param baseAmount_ The base asset amount.
    /// @param quote_ The quote asset address.
    /// @return The quote asset amount.
    function calcConversionAmount(
        address base_,
        uint256 baseAmount_,
        address quote_
    ) external view returns (uint256) {
        if (baseAmount_ == 0) return 0;

        uint256 baseUnit = 10**uint256(IERC20Metadata(base_).decimals());
        uint256 quoteUnit = 10**uint256(IERC20Metadata(quote_).decimals());
        uint256 basePrice = _getChainlinkPrice(assetToAggregator[base_]);
        uint256 quotePrice = _getChainlinkPrice(assetToAggregator[quote_]);

        return (baseAmount_ * basePrice * quoteUnit) / (baseUnit * quotePrice);
    }

    /// @notice Set the stale period.
    /// @param stalePeriod_ The period of stale.
    function setStalePeriod(uint256 stalePeriod_) external onlyOwner {
        stalePeriod = stalePeriod_;
        emit StalePeriodUpdated(stalePeriod_);
    }

    /// @notice Add assets with the corresponding aggregators.
    /// @param assets_ The asset list to be supported.
    /// @param aggregators_ The corresponding chainlink aggregator list.
    /// @dev All aggregators should have the same quote and decimals.
    function addAssets(address[] calldata assets_, address[] calldata aggregators_) external onlyOwner {
        Errors._require(
            assets_.length == aggregators_.length,
            Errors.Code.CHAINLINK_ASSETS_AND_AGGREGATORS_INCONSISTENT
        );

        for (uint256 i; i < assets_.length; i++) {
            Errors._require(
                assets_[i] != address(0) && aggregators_[i] != address(0),
                Errors.Code.CHAINLINK_ZERO_ADDRESS
            );
            Errors._require(assetToAggregator[assets_[i]] == address(0), Errors.Code.CHAINLINK_EXISTING_ASSET);

            _getChainlinkPrice(aggregators_[i]); // Try it out
            assetToAggregator[assets_[i]] = aggregators_[i];

            emit AssetAdded(assets_[i], aggregators_[i]);
        }
    }

    /// @notice Remove assets.
    /// @param assets_ The asset list to be removed.
    function removeAssets(address[] calldata assets_) external onlyOwner {
        for (uint256 i; i < assets_.length; i++) {
            Errors._require(assetToAggregator[assets_[i]] != address(0), Errors.Code.CHAINLINK_NON_EXISTENT_ASSET);
            delete assetToAggregator[assets_[i]];

            emit AssetRemoved(assets_[i]);
        }
    }

    /// @notice Get chainlink data.
    /// @param aggregator_ The chainlink aggregator address.
    function _getChainlinkPrice(address aggregator_) private view returns (uint256) {
        Errors._require(aggregator_ != address(0), Errors.Code.CHAINLINK_ZERO_ADDRESS);

        (, int256 price, , uint256 updatedAt, ) = IChainlinkAggregatorV3(aggregator_).latestRoundData();

        Errors._require(price > 0, Errors.Code.CHAINLINK_INVALID_PRICE);
        Errors._require(updatedAt >= block.timestamp - stalePeriod, Errors.Code.CHAINLINK_STALE_PRICE);

        return uint256(price);
    }
}
