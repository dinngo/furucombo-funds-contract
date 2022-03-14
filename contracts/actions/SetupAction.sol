// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISetupAction} from "../interfaces/ISetupAction.sol";

contract SetupAction is ISetupAction {
    using SafeERC20 for IERC20;

    function maxApprove(IERC20 token) external {
        token.safeApprove(msg.sender, type(uint256).max);
    }
}
