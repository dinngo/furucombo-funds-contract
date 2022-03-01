// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "../libraries/LibUniqueAddressList.sol";
import {PoolState} from "../PoolState.sol";

/// @title Asset module
/// @notice Define the asset relate policy of the pool.
abstract contract AssetModule is PoolState {
    using LibUniqueAddressList for LibUniqueAddressList.List;

    LibUniqueAddressList.List private _assetList;

    event AssetAdded(address asset);
    event AssetRemoved(address asset);

    /// @notice Add asset to the asset tracking list.
    /// @param asset The asset to be tracked.
    function _addAsset(address asset)
        internal
        virtual
        when3States(State.Executing, State.RedemptionPending, State.Liquidating)
    {
        if (_assetList.pushBack(asset)) {
            emit AssetAdded(asset);
        }
    }

    /// @notice Remove the asset from the asset tracking list.
    function _removeAsset(address asset)
        internal
        virtual
        when3States(State.Executing, State.RedemptionPending, State.Liquidating)
    {
        if (_assetList.remove(asset)) {
            emit AssetRemoved(asset);
        }
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
}
