// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibFee {
    function _max64x64(int128 a, int128 b) internal pure returns (int128) {
        if (a > b) {
            return a;
        } else {
            return b;
        }
    }

    function _max(int256 a, int256 b) internal pure returns (int256) {
        if (a > b) {
            return a;
        } else {
            return b;
        }
    }

    function _max(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a > b) {
            return a;
        } else {
            return b;
        }
    }
}
