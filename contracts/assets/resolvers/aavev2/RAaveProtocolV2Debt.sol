// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IATokenV2} from "../../../interfaces/IATokenV2.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RAaveProtocolV2Debt is IAssetResolver, AssetResolverBase {
    function calcAssetValue(
        address asset, // should be debtToken
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        address underlying = IATokenV2(asset).UNDERLYING_ASSET_ADDRESS();
        return _toNegativeValue(_calcAssetValue(underlying, amount, quote));
    }
}
