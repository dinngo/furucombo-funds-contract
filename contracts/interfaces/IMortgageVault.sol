// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMortgageVault {
    function mortgageToken() external view returns (IERC20);

    function totalAmount() external view returns (uint256);

    function fundAmounts(address fund_) external view returns (uint256);

    function mortgage(uint256 amount_) external;

    function claim(address receiver_) external;
}
