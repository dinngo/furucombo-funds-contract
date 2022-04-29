// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ComptrollerImplementation} from "../ComptrollerImplementation.sol";

contract ComptrollerImplementationMock is ComptrollerImplementation {
    constructor() ComptrollerImplementation() {
        _transferOwnership(msg.sender);
    }
}
