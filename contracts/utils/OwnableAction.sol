// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Create immutable owner for action contract
 */
abstract contract OwnableAction {
    address payable public immutable actionOwner;

    constructor(address payable owner_) {
        actionOwner = owner_;
    }
}
