// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "./utils/Errors.sol";

contract MortgageVault {
    using SafeERC20 for IERC20;

    IERC20 public mortgageToken;
    uint256 public totalAmount;
    mapping(address => uint256) public poolAmounts;

    event Mortgaged(
        address indexed sender,
        address indexed pool,
        uint256 amount
    );
    event Claimed(
        address indexed receiver,
        address indexed pool,
        uint256 amount
    );

    constructor(IERC20 token_) {
        mortgageToken = token_;
    }

    function mortgage(
        address sender,
        address pool,
        uint256 amount
    ) external {
        Errors._require(
            poolAmounts[pool] == 0,
            Errors.Code.MORTGAGE_VAULT_POOL_MORTGAGED
        );
        poolAmounts[pool] += amount;
        totalAmount += amount;
        mortgageToken.safeTransferFrom(sender, address(this), amount);
        emit Mortgaged(sender, pool, amount);
    }

    function claim(address receiver) external {
        address pool = msg.sender;
        uint256 amount = poolAmounts[pool];
        poolAmounts[pool] = 0;
        totalAmount -= amount;

        mortgageToken.safeTransfer(receiver, amount);
        emit Claimed(receiver, pool, amount);
    }
}
