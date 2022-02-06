// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MortgageVault {
    using SafeERC20 for IERC20;

    IERC20 public mortgage;
    uint256 public totalAmount;
    mapping(address => uint256) public poolAmounts;

    constructor(IERC20 mortgage_) {
        mortgage = mortgage_;
    }

    function stake(
        address sender,
        address pool,
        uint256 amount
    ) external {
        require(poolAmounts[pool] == 0, "Pool staked");
        poolAmounts[pool] += amount;
        totalAmount += amount;
        mortgage.safeTransferFrom(sender, address(this), amount);
    }

    function claim(address receiver) external {
        address pool = msg.sender;
        uint256 amount = poolAmounts[pool];
        poolAmounts[pool] = 0;
        totalAmount -= amount;
        mortgage.safeTransfer(receiver, amount);
    }
}
