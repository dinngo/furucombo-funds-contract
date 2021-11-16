// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareERC20} from "../interfaces/IShareERC20.sol";
import {ModuleBase} from "./ModuleBase.sol";
import {ManagementFee} from "./ManagementFee.sol";
import {PerformanceFee} from "./PerformanceFee.sol";

abstract contract FeeModule is ModuleBase, ManagementFee, PerformanceFee {
    // Implementations
    function __getShareToken()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (IShareERC20)
    {
        return shareToken;
    }

    function __getGrossAssetValue()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (uint256)
    {
        return getAssetValue();
    }

    function __getNetAssetValue()
        internal
        view
        override(ManagementFee, PerformanceFee)
        returns (uint256)
    {
        return getAssetValue();
    }

    function getAssetValue() public view virtual returns (uint256);

    function __getManager()
        internal
        view
        override(ManagementFee)
        returns (address)
    {
        return getManager();
    }

    function getManager() public view virtual returns (address);
}
