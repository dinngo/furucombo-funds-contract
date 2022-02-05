// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IDebtToken {
    function balanceOf(address user) external view returns (uint256);

    function scaledBalanceOf(address user) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function scaledTotalSupply() external view returns (uint256);

    function getScaledUserBalanceAndSupply(address user)
        external
        view
        returns (uint256, uint256);

    function approveDelegation(address delegatee, uint256 amount) external;

    function borrowAllowance(address fromUser, address toUser)
        external
        view
        returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function allowance(address owner, address spender)
        external
        view
        returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);
}
