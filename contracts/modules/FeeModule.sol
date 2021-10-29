// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ModuleBase} from "./ModuleBase.sol";

abstract contract FeeModule is ModuleBase {
    function claim() external returns (uint256) {
        return 0;
    }
}
