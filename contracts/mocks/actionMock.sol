// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract AMock {
    function doUint(uint256 _u) external payable returns (uint256) {
        return _u;
    }

    function doAddress(address _a) external payable returns (address) {
        return _a;
    }
}
