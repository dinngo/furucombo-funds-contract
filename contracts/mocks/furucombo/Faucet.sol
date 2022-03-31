// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract Faucet {
    using SafeERC20 for IERC20;

    fallback() external payable {}

    receive() external payable {}

    function drain() external payable {
        uint256 give = msg.value * 2;
        (bool result, ) = msg.sender.call{value: give}(new bytes(0));
        result;
    }

    function drainToken(address token_, uint256 amount_) external {
        uint256 give = amount_ * 2;
        IERC20(token_).safeTransferFrom(msg.sender, address(this), amount_);
        IERC20(token_).safeTransfer(msg.sender, give);
    }
}
