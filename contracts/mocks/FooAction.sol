// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./Foo.sol";

contract FooAction {
    event FooBytes32(bytes32 a);
    event FooUint256(uint256 b);

    function getContractName() public pure returns (string memory) {
        return "FooAction";
    }

    function bar(address to) external payable returns (bytes32 ret) {
        ret = Foo(to).bar();
    }

    function barUint(address to) external payable returns (uint256 ret) {
        ret = Foo(to).barUint();
    }

    function bar1(address to, bytes32 a)
        external
        payable
        returns (bytes32 ret)
    {
        ret = Foo(to).bar1(a);
    }

    function bar2(
        address to,
        bytes32 a,
        bytes32 b
    ) external payable returns (bytes32 ret) {
        ret = Foo(to).bar2(a, b);
    }

    function barUint1(address to, uint256 a)
        external
        payable
        returns (uint256 ret)
    {
        ret = Foo(to).barUint1(a);
    }

    function barUint2(
        address to,
        uint256 a,
        uint256 value
    ) external payable returns (uint256 ret) {
        ret = Foo(to).barUint2{value: value}(a);
    }

    function barUList(
        address to,
        uint256 a,
        uint256 b,
        uint256 c
    ) external payable returns (uint256[] memory ret) {
        ret = Foo(to).barUList(a, b, c);
    }

    function barUList2(address to, uint256[] calldata uList)
        external
        payable
        returns (uint256[] memory ret)
    {
        ret = Foo(to).barUList2(uList);
    }

    function revertCall() external payable {
        revert("revertCall");
    }
}
