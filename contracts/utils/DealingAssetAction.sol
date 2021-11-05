// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/DealAsset.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract DealingAssetAction {
    modifier assetCleanUp() {
        cleanAssets();
        _;
        cleanAssets();
    }

    function getDealingAsset(address key) internal view returns (bool) {
        return DealingAsset.get(key);
    }

    function addDealingAsset(address key) internal {
        if (!getDealingAsset(key)) {
            DealingAsset.set(key, true);
        }
    }

    function removeDealingAsset(address key) internal {
        DealingAsset.set(key, false);
    }

    function getDealingAssets() internal view returns (address[] memory) {
        return DealingAsset.assets();
    }

    function cleanAssets() internal {
        DealingAsset.clean();
    }
}
