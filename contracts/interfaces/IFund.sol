// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IFund {
    function level() external returns (uint256);

    function vault() external view returns (address);
}
