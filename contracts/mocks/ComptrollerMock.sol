// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ComptrollerMock {
    address private _action;

    function setAction(address action) public {
        _action = action;
    }

    function execAction() public view returns (address) {
        return _action;
    }
}
