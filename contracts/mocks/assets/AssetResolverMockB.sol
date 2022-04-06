// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAssetResolver} from "../../assets/interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../assets/AssetResolverBase.sol";

contract AssetResolverMockB is IAssetResolver, AssetResolverBase {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external pure override returns (int256) {
        asset_;
        quote_;
        return (amount_ * 2).toInt256() * -1;
    }
}
