// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMortgageVault {
    function mortgage() external view returns (address);

    function totalAmount() external view returns (uint256);

    function fundAmounts(address fund) external view returns (uint256);

    function mortgage(
        address sender,
        address fund,
        uint256 amount
    ) external;

    function claim(address receiver) external;
}
