// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibFee {
    function _max64x64(int128 a_, int128 b_) internal pure returns (int128) {
        if (a_ > b_) {
            return a_;
        } else {
            return b_;
        }
    }

    function _max(int256 a_, int256 b_) internal pure returns (int256) {
        if (a_ > b_) {
            return a_;
        } else {
            return b_;
        }
    }

    function _max(uint256 a_, uint256 b_) internal pure returns (uint256) {
        if (a_ > b_) {
            return a_;
        } else {
            return b_;
        }
    }
}
