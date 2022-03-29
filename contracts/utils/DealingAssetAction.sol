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

    function _getDealingAsset(address asset_) internal view returns (bool) {
        return DealingAsset._get(asset_);
    }

    function _addDealingAsset(address asset_) internal {
        if (!_getDealingAsset(asset_)) {
            DealingAsset._set(asset_, true);
        }
    }

    function _removeDealingAsset(address asset_) internal {
        DealingAsset._set(asset_, false);
    }

    function _getDealingAssets() internal view returns (address[] memory) {
        return DealingAsset._assets();
    }

    function _getDealingAssetLength() internal view returns (uint256) {
        return DealingAsset._getLength();
    }

    function _cleanAssets() internal {
        DealingAsset._clean();
    }
}
