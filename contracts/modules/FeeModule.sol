// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "../interfaces/IShareToken.sol";
import {PoolState} from "../PoolState.sol";
import {ManagementFee} from "./ManagementFee.sol";
import {PerformanceFee} from "./PerformanceFee.sol";

/// @title Fee module
/// @notice The fee module is composed by management fee and performance fee.
abstract contract FeeModule is PoolState, ManagementFee, PerformanceFee {
    // General
    /// @notice Get the share token of the pool.
    function __getShareToken()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (IShareToken)
    {
        return shareToken;
    }

    /// @notice Get the total value of all the asset of the pool.
    function getTotalAssetValue() public view virtual returns (uint256);

    /// @notice Get the gross asset value of the pool.
    function __getGrossAssetValue() internal view override returns (uint256) {
        return getTotalAssetValue();
    }

    /// @notice Get the manager address.
    function __getManager()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (address)
    {
        return getManager();
    }

    /// @notice Get the manager address.
    function getManager() public view virtual returns (address);

    // Management fee
    /// @notice Manangement fee should only be accumulated in executing state.
    function _updateManagementFee() internal override returns (uint256) {
        if (state == State.Executing) {
            return super._updateManagementFee();
        } else {
            lastMFeeClaimTime = block.timestamp;
            return 0;
        }
    }
}
