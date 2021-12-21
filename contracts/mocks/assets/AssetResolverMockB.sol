// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAssetResolver} from "../../assets/interfaces/IAssetResolver.sol";

contract AssetResolverMockB is IAssetResolver {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external pure override returns (int256) {
        asset;
        quote;
        return (amount * 2).toInt256() * -1;
    }
}
