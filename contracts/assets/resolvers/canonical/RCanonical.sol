// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RCanonical is IAssetResolver, AssetResolverBase {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external view override returns (int256) {
        uint256 value = _getAssetOracle().calcConversionAmount(asset_, amount_, quote_);
        return _castAssetValue(value);
    }
}
