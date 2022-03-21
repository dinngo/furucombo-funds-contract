// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "./utils/Errors.sol";

contract MortgageVault {
    using SafeERC20 for IERC20;

    IERC20 public mortgage;
    uint256 public totalAmount;
    mapping(address => uint256) public poolAmounts;

    event Staked(address indexed sender, address indexed pool, uint256 amount);
    event Claimed(
        address indexed receiver,
        address indexed pool,
        uint256 amount
    );

    constructor(IERC20 mortgage_) {
        mortgage = mortgage_;
    }

    function stake(
        address sender,
        address pool,
        uint256 amount
    ) external {
        Errors._require(
            poolAmounts[pool] == 0,
            Errors.Code.MORTGAGE_VAULT_POOL_STAKED
        );
        poolAmounts[pool] += amount;
        totalAmount += amount;
        mortgage.safeTransferFrom(sender, address(this), amount);
        emit Staked(sender, pool, amount);
    }

    function claim(address receiver) external {
        address pool = msg.sender;
        uint256 amount = poolAmounts[pool];
        poolAmounts[pool] = 0;
        totalAmount -= amount;

        mortgage.safeTransfer(receiver, amount);
        emit Claimed(receiver, pool, amount);
    }
}
