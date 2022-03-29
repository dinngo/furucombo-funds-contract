// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract Foo4 {
    bytes32 public bValue;
    uint256 public nValue;

    function bar() external pure returns (bytes32) {
        return 0x0000000000000000000000000000000000000000000000000123456789abcdef;
    }

    function barUint() external returns (uint256) {
        nValue = 1 ether;
        return nValue;
    }

    function bar1(bytes32 a_) external returns (bytes32) {
        bValue = a_;
        return bValue;
    }

    function bar2(bytes32, bytes32 b_) external returns (bytes32) {
        bValue = b_;
        return bValue;
    }

    function barUint1(uint256 a_) external returns (uint256) {
        nValue = a_;
        return nValue;
    }

    function barUList(
        uint256 a_,
        uint256 b_,
        uint256 c_
    ) external pure returns (uint256[] memory) {
        uint256[] memory uList = new uint256[](3);
        uList[0] = a_;
        uList[1] = b_;
        uList[2] = c_;
        return uList;
    }
}
