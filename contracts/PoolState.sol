// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract PoolState {
    IERC20 public immutable denomination;
    address public vault; // DSProxy

    constructor(IERC20 denomination_) {
        denomination = denomination_;
    }
}
