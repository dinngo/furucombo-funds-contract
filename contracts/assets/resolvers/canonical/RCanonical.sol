// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../AssetResolverBase.sol";

contract RCanonical is IAssetResolver, AssetResolverBase {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        uint256 value = _getAssetOracle().calcConversionAmount(
            asset,
            amount,
            quote
        );
        return _castAssetValue(value);
    }
}
