// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PoolState} from "../PoolState.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";

abstract contract ModuleBase is PoolState {}
