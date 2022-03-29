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

    function _getDealingAsset(address asset) internal view returns (bool) {
        return DealingAsset._get(asset);
    }

    function _addDealingAsset(address asset) internal {
        if (!_getDealingAsset(asset)) {
            DealingAsset._set(asset, true);
        }
    }

    function _removeDealingAsset(address asset) internal {
        DealingAsset._set(asset, false);
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
