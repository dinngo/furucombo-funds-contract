// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RCurveStable} from "../../assets/resolvers/curve/RCurveStable.sol";

contract RCurveStableMock is RCurveStable {
    function _calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) internal pure override returns (int256) {
        asset_;
        quote_;
        return -int256(amount_);
    }
}
