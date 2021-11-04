// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/DealAsset.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract DealAssetAction {
    modifier assetCleanUp() {
        cleanAsset();
        _;
        cleanAsset();
    }

    function getDealAsset(address key) internal view returns (bool) {
        return DealAsset.get(key);
    }

    function addDealAsset(address key) internal {
        if (!getDealAsset(key)) {
            DealAsset.set(key, true);
        }
    }

    function removeDealAsset(address key) internal {
        DealAsset.set(key, false);
    }

    function getDealAssets() internal view returns (address[] memory) {
        return DealAsset.assets();
    }

    function cleanAsset() internal {
        DealAsset.clean();
    }
}
