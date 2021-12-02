// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "./IShareToken.sol";

interface IPool {
    function initializeOwnership(address newOwner) external;

    function getLevel() external returns (uint256);

    function canDelegateCall(address asset, bytes4 sig)
        external
        pure
        returns (bool);

    function canContractCall(address asset, bytes4 sig)
        external
        pure
        returns (bool);

    function initialize(
        uint256 level,
        address comptroller,
        address denomination,
        address shareToken,
        uint256 reserveExecution
    ) external;
}
