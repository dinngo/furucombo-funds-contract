// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SimpleAction {
    FooForAction private immutable _ac;

    constructor() {
        _ac = new FooForAction();
    }

    function foo() public {
        _ac.bar();
    }

    function fooAddress() public returns (address[] memory) {
        _ac.bar();
        address[] memory temp;
        return temp;
    }

    function bar() public view returns (uint256) {
        return _ac.get();
    }
}

contract FooForAction {
    uint256 private _n;

    function bar() public {
        _n++;
    }

    function get() public view returns (uint256) {
        return _n;
    }
}
