// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SetupActionMock {
    using SafeERC20 for IERC20;

    function maxApprove(IERC20 token_) external {
        token_.safeApprove(msg.sender, 1000);
    }
}
