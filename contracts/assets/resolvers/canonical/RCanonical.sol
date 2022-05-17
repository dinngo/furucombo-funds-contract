// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

/// @title The canonical resolver
contract RCanonical is IAssetResolver, AssetResolverBase {
    /// @notice Calculate asset value
    /// @param asset_ The asset address.
    /// @param amount_ The amount of asset.
    /// @param quote_ The address of the quote token.
    /// @return The value of asset in quote token.
    /// @dev The value must be positive.
    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external view returns (int256) {
        uint256 value = _getAssetOracle().calcConversionAmount(asset_, amount_, quote_);
        return _castAssetValue(value);
    }
}
