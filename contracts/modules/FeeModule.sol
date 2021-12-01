// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "../interfaces/IShareToken.sol";
import {PoolState} from "../PoolState.sol";
import {ManagementFee} from "./ManagementFee.sol";
import {PerformanceFee} from "./PerformanceFee.sol";

abstract contract FeeModule is PoolState, ManagementFee, PerformanceFee {
    // General
    function __getShareToken()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (IShareToken)
    {
        return shareToken;
    }

    function __getTotalAssetValue() internal view virtual returns (uint256);

    function __getGrossAssetValue() internal view override returns (uint256) {
        return __getTotalAssetValue();
    }

    function __getManager()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (address)
    {
        return getManager();
    }

    function getManager() public view virtual returns (address);

    // Management fee
    function _updateManagementFee() internal override returns (uint256) {
        if (state == State.Executing) {
            return super._updateManagementFee();
        } else {
            lastMFeeClaimTime = block.timestamp;
            return 0;
        }
    }
}
