// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "../interfaces/IShareToken.sol";
import {ModuleBase} from "./ModuleBase.sol";
import {ManagementFee} from "./ManagementFee.sol";
import {PerformanceFee} from "./PerformanceFee.sol";

abstract contract FeeModule is ModuleBase, ManagementFee, PerformanceFee {
    // Implementations
    function __getShareToken()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (IShareToken)
    {
        return shareToken;
    }

    function getAssetValue() public view virtual returns (uint256);

    function __getGrossAssetValue() internal view override returns (uint256) {
        return getAssetValue();
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
}
