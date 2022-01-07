// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMortgageVault {
    function mortgage() external view returns (address);

    function totalAmount() external view returns (uint256);

    function poolAmounts(address pool) external view returns (uint256);

    function stake(
        address sender,
        address pool,
        uint256 amount
    ) external;

    function claim(address receiver) external;
}
