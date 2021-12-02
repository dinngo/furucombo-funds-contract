// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "../libraries/LibUniqueAddressList.sol";
import {PoolState} from "../PoolState.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

/// @title Asset module
/// @notice Define the asset relate policy of the pool.
abstract contract AssetModule is PoolState {
    using LibUniqueAddressList for LibUniqueAddressList.List;
    using Whitelist for Whitelist.AssetWList;

    LibUniqueAddressList.List private _assetList;
    Whitelist.AssetWList private _assetWList;

    /// @notice Add asset to the asset tracking list.
    /// @param asset The asset to be tracked.
    function addAsset(address asset) public virtual {
        _assetList.pushBack(asset);
    }

    /// @notice Remove the asset from the asset tracking list.
    function removeAsset(address asset) public virtual {
        _assetList.remove(asset);
    }

    /// @notice Check the remaining asset should be only the denomination asset
    /// when closing the vault.
    function close() public virtual {
        require(
            _assetList.size() == 1 &&
                _assetList.front() == address(denomination),
            "Different asset remaining"
        );
        _close();
    }

    /// @notice Permit the asset to be active in the pool.
    /// @param asset The asset to be permitted.
    function permitAsset(address asset) public virtual {
        _permitAsset(asset);
    }

    /// @notice Permit all the supported asset to be active in the pool.
    function permitAllAsset() public virtual {
        _permitAsset(address(0));
    }

    /// @notice Forbid the asset from being active in the pool.
    /// @param asset The asset to be forbidden.
    function forbidAsset(address asset) public virtual {
        _forbidAsset(asset);
    }

    /// @notice Cancel the permission of all the supported asset to be active in
    /// the pool.
    function cancelPermitAllAsset() public virtual {
        _forbidAsset(address(0));
    }

    /// @notice Verify the given asset.
    /// @param asset The asset to be verified.
    /// @return Return if the asset is valid.
    function isValidAsset(address asset) public view virtual returns (bool) {
        return
            _assetWList.canCall(0, address(0)) || _assetWList.canCall(0, asset);
    }

    /// @notice Get the permitted asset list.
    /// @return Return the permitted asset list array.
    function getAssetList() public view returns (address[] memory) {
        return _assetList.get();
    }

    /// @notice Get the balance of the denomination asset.
    /// @return The balance of reserve.
    function getReserve() public view returns (uint256) {
        return denomination.balanceOf(address(vault));
    }

    /// @dev Assets can only be permitted at initializing and ready stage.
    /// @param asset The asset to be permitted.
    function _permitAsset(address asset)
        internal
        virtual
        whenStates(State.Initializing, State.Ready)
    {
        _assetWList.permit(0, asset);
    }

    /// @dev Assets can only be forbidden at initializing and ready stage.
    /// @param asset The asset to be forbidden.
    function _forbidAsset(address asset)
        internal
        virtual
        whenStates(State.Initializing, State.Ready)
    {
        _assetWList.forbid(0, asset);
    }
}
