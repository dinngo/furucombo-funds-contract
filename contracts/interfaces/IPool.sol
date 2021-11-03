// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPool {
    function initializeOwnership(address newOwner) external;

    function getLevel() external returns (uint256);
}
