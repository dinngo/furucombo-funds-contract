// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../../assets/interfaces/IAssetResolver.sol";

contract AssetResolverMockA is IAssetResolver {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external pure override returns (int256) {
        asset;
        quote;
        return (amount * 2).toInt256();
    }
}
