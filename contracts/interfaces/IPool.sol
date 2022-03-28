// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "./IShareToken.sol";

interface IPool {
    function initializeOwnership(address newOwner) external;

    function level() external returns (uint256);

    function vault() external view returns (address);

    function initialize(
        uint256 level,
        address comptroller,
        address denomination,
        address shareToken,
        uint256 reserveExecutionRate
    ) external;
}
