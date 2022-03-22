// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IATokenV2} from "../../../interfaces/IATokenV2.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RAaveProtocolV2Asset is IAssetResolver, AssetResolverBase {
    function calcAssetValue(
        address asset, // should be aToken
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        address underlying = IATokenV2(asset).UNDERLYING_ASSET_ADDRESS();
        return _calcAssetValue(underlying, amount, quote);
    }
}
