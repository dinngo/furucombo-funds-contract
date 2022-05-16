// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {Errors} from "../utils/Errors.sol";
import {LibUniqueAddressList} from "../libraries/LibUniqueAddressList.sol";

/// @title Asset module
/// @notice Define the asset relate policy of the fund.
abstract contract AssetModule is FundProxyStorageUtils {
    using LibUniqueAddressList for LibUniqueAddressList.List;

    event AssetAdded(address asset);
    event AssetRemoved(address asset);

    /// @notice Get the permitted asset list.
    /// @return Return the permitted asset list array.
    function getAssetList() public view returns (address[] memory) {
        return _assetList._get();
    }

    /// @notice Check the remaining asset should be only the denomination asset
    /// when closing the vault.
    function close() public virtual {
        Errors._require(
            _assetList._size() == 1 && _assetList._front() == address(denomination),
            Errors.Code.ASSET_MODULE_DIFFERENT_ASSET_REMAINING
        );
        _close();
    }

    /// @notice Check asset capacity.
    function _checkAssetCapacity() internal view {
        Errors._require(
            getAssetList().length <= comptroller.assetCapacity(),
            Errors.Code.ASSET_MODULE_FULL_ASSET_CAPACITY
        );
    }

    /// @notice Add asset to the asset tracking list.
    /// @param asset_ The asset to be tracked.
    /// @dev This funtion is use in `Executing`, `Pending` and `Liquidating` states.
    function _addAsset(address asset_) internal virtual when3States(State.Executing, State.Pending, State.Liquidating) {
        if (_assetList._pushBack(asset_)) {
            emit AssetAdded(asset_);
        }
    }

    /// @notice Remove the asset from the asset tracking list.
    /// @dev This funtion is use in `Executing`, `Pending` and `Liquidating` states.
    function _removeAsset(address asset_)
        internal
        virtual
        when3States(State.Executing, State.Pending, State.Liquidating)
    {
        if (_assetList._remove(asset_)) {
            emit AssetRemoved(asset_);
        }
    }
}
