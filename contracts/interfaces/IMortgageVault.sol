// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMortgageVault {
    function mortgage() external view returns (address);

    function totalAmount() external view returns (uint256);

    function fundAmounts(address fund_) external view returns (uint256);

    function mortgage(
        address sender_,
        address fund_,
        uint256 amount_
    ) external;

    function claim(address receiver_) external;
}
