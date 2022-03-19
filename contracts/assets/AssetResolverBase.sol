// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Errors} from "../utils/Errors.sol";
import {IAssetRouter} from "./interfaces/IAssetRouter.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";

abstract contract AssetResolverBase {
    using SafeCast for uint256;

    function _castAssetValue(uint256 amount) internal pure returns (int256) {
        return amount.toInt256();
    }

    function _toNegativeValue(int256 amount) internal pure returns (int256) {
        Errors._require(amount >= 0, Errors.Code.RESOLVER_BASE_NEGATIVE_AMOUNT);
        return amount * -1;
    }

    function _getAssetOracle() internal view returns (IAssetOracle) {
        return IAssetRouter(msg.sender).oracle();
    }

    function _calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) internal view returns (int256) {
        return IAssetRouter(msg.sender).calcAssetValue(asset, amount, quote);
    }
}
