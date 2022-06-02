// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISetupAction} from "../interfaces/ISetupAction.sol";

/// @title Setup Action contract
contract SetupAction is ISetupAction {
    using SafeERC20 for IERC20;

    /// @notice Approve token max amount for sender.
    /// @param token_ The ERC20 Token.
    function maxApprove(IERC20 token_) external {
        token_.safeApprove(msg.sender, type(uint256).max);
    }
}
