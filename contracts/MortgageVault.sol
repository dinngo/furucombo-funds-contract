// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "./utils/Errors.sol";

/// @title The fund mortage vault
contract MortgageVault {
    using SafeERC20 for IERC20;

    IERC20 public mortgageToken;
    uint256 public totalAmount;
    mapping(address => uint256) public fundAmounts;

    event Mortgaged(address indexed fund, uint256 amount);
    event Claimed(address indexed receiver, address indexed fund, uint256 amount);

    constructor(IERC20 token_) {
        mortgageToken = token_;
    }

    /// @notice Mortgage tokens to this contract.
    /// @param amount_ The mortage token amount.
    function mortgage(uint256 amount_) external {
        if (amount_ == 0) return;
        address fund = msg.sender;
        Errors._require(fundAmounts[fund] == 0, Errors.Code.MORTGAGE_VAULT_FUND_MORTGAGED);
        fundAmounts[fund] += amount_;
        totalAmount += amount_;
        mortgageToken.safeTransferFrom(fund, address(this), amount_);
        emit Mortgaged(fund, amount_);
    }

    /// @notice Claim mortgage tokens of msg.sender and send the tokens to receiver
    /// @param receiver_ The receiver address.
    function claim(address receiver_) external {
        address fund = msg.sender;
        uint256 amount = fundAmounts[fund];
        if (amount == 0) return;
        fundAmounts[fund] = 0;
        totalAmount -= amount;
        mortgageToken.safeTransfer(receiver_, amount);
        emit Claimed(receiver_, fund, amount);
    }
}
