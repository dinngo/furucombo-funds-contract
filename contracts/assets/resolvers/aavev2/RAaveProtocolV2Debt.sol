// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../../interfaces/IATokenV2.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../AssetResolverBase.sol";

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
