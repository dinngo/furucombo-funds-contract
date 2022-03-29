// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Can only be delegate call.
 */
abstract contract DelegateCallAction {
    address private immutable _self;

    modifier delegateCallOnly() {
        require(_self != address(this), "Delegate call only");
        _;
    }

    constructor() {
        _self = address(this);
    }
}
