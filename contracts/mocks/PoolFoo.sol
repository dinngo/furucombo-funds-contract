// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract PoolFoo {
    bytes32 public bValue;
    uint256 public nValue;
    uint256[] public nList;

    function bar() external pure returns (bytes32) {
        return
            0x0000000000000000000000000000000000000000000000000123456789abcdef;
    }

    function barUint() external returns (uint256) {
        nValue = 1 ether;
        return nValue;
    }

    function bar1(bytes32 a) external returns (bytes32) {
        bValue = a;
        return bValue;
    }

    function bar2(bytes32, bytes32 b) external returns (bytes32) {
        bValue = b;
        return bValue;
    }

    function barUint1(uint256 a) external returns (uint256) {
        nValue = a;
        return nValue;
    }

    function barUint2(uint256 a) external payable returns (uint256) {
        nValue = a;
        return nValue;
    }

    function barUList(
        uint256 a,
        uint256 b,
        uint256 c
    ) external pure returns (uint256[] memory) {
        uint256[] memory uList = new uint256[](3);
        uList[0] = a;
        uList[1] = b;
        uList[2] = c;
        return uList;
    }

    function barUList2(uint256[] memory uList)
        external
        returns (uint256[] memory)
    {
        nList = uList;
        return nList;
    }

    function revertCall() external pure {
        revert("revertCall");
    }
}
