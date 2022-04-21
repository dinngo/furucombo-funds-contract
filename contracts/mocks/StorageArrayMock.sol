// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StorageArray} from "../libraries/StorageArray.sol";

contract StorageArrayMock {
    using StorageArray for bytes32;

    bytes32 private constant _ARRAY_SLOT = 0x1af59a3fd3f5a4bba6259b5a65dd4f4fbaab48545aeeabdfb609691000000000;

    function pop() public returns (bytes32) {
        return _ARRAY_SLOT._pop();
    }

    function get(uint256 index_) public view returns (bytes32) {
        return _ARRAY_SLOT._get(index_);
    }

    function set(uint256 index_, bytes32 val_) public {
        _ARRAY_SLOT._set(index_, val_);
    }
}
