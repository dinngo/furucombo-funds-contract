// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleAction {
    FooForAction private immutable _ac;

    constructor() {
        _ac = new FooForAction();
    }

    function foo() public {
        _ac.bar();
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
