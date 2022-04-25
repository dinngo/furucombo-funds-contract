// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RCanonical is IAssetResolver, AssetResolverBase {
    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external view returns (int256) {
        uint256 value = _getAssetOracle().calcConversionAmount(asset_, amount_, quote_);
        return _castAssetValue(value);
    }
}
