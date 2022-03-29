// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract Foo {
    mapping(address => uint256) public accounts;

    function bar(uint256 a_) public returns (uint256 result) {
        accounts[msg.sender] = a_;
        return a_;
    }
}
