// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Errors} from "../utils/Errors.sol";
import {IAssetRouter} from "./interfaces/IAssetRouter.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";

abstract contract AssetResolverBase {
    using SafeCast for uint256;

    function _castAssetValue(uint256 amount_) internal pure returns (int256) {
        return amount_.toInt256();
    }

    function _toNegativeValue(int256 amount_) internal pure returns (int256) {
        Errors._require(amount_ >= 0, Errors.Code.RESOLVER_BASE_NEGATIVE_AMOUNT);
        return amount_ * -1;
    }

    function _getAssetOracle() internal view returns (IAssetOracle) {
        return IAssetRouter(msg.sender).oracle();
    }

    function _calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) internal view returns (int256) {
        return IAssetRouter(msg.sender).calcAssetValue(asset_, amount_, quote_);
    }
}
