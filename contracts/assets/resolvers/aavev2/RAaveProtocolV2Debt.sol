// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IATokenV2} from "../../../interfaces/IATokenV2.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RAaveProtocolV2Debt is IAssetResolver, AssetResolverBase {
    function calcAssetValue(
        address asset_, // should be debtToken
        uint256 amount_,
        address quote_
    ) external view returns (int256) {
        address underlying = IATokenV2(asset_).UNDERLYING_ASSET_ADDRESS();
        return _toNegativeValue(_calcAssetValue(underlying, amount_, quote_));
    }
}
