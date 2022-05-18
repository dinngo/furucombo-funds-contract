// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAssetRouter} from "./interfaces/IAssetRouter.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";

/// @title Asset resolver base contract
abstract contract AssetResolverBase {
    using SafeCast for uint256;

    /// @dev Cast asset value is positive.
    /// @return The calculated amount.
    function _castAssetValue(uint256 amount_) internal pure returns (int256) {
        return amount_.toInt256();
    }

    /// @notice Get the asset oracle.
    /// @return The asset oracle address.
    function _getAssetOracle() internal view returns (IAssetOracle) {
        return IAssetRouter(msg.sender).oracle();
    }

    /// @notice Calculate asset value.
    /// @param asset_ The asset address.
    /// @param amount_ The amount of asset.
    /// @param quote_ The address of the quote token.
    function _calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) internal view virtual returns (int256) {
        return IAssetRouter(msg.sender).calcAssetValue(asset_, amount_, quote_);
    }
}
