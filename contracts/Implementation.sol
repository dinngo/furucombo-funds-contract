// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {PoolState} from "./PoolState.sol";
import {ShareModule} from "./modules/ShareModule.sol";

contract Implemetation is ShareModule {
    constructor(string memory name_, string memory symbol_)
        ERC20Permit(name_)
        ERC20(name_, symbol_)
    {}
}
