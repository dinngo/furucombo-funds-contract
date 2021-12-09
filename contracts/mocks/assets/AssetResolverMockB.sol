// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../assets/interfaces/IAssetResolver.sol";

contract AssetResolverMockB is IAssetResolver {
    function calcValue(
        address asset,
        uint256 amount,
        address quote
    ) external pure override returns (int256) {
        asset;
        quote;
        return int256(amount / 2) * -1;
    }
}
