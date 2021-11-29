// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareERC20} from "./IShareERC20.sol";

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

    function initializeShare(address share) external;

    function initializeComptroller(address comptroller) external;

    function initializeDenomination(address denomination) external;

    function initializeDSProxy() external;
}
