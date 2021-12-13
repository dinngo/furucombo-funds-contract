// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SetupAction {
    using SafeERC20 for IERC20;

    function maxApprove(IERC20 token) external {
        token.safeApprove(msg.sender, type(uint256).max);
    }
}
