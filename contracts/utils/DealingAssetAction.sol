// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DealingAsset} from "../libraries/DealingAsset.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract DealingAssetAction {
    modifier assetCleanUp() {
        _cleanAssets();
        _;
        _cleanAssets();
    }

    function _isDealingAssetExist(address asset_) internal view returns (bool) {
        return DealingAsset._exist(asset_);
    }

    function _getDealingAssets() internal view returns (address[] memory) {
        return DealingAsset._assets();
    }

    function _getDealingAssetLength() internal view returns (uint256) {
        return DealingAsset._getLength();
    }

    function _addDealingAsset(address asset_) internal {
        DealingAsset._add(asset_);
    }

    function _cleanAssets() internal {
        DealingAsset._clean();
    }
}
