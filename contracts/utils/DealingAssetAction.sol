// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {DealingAsset} from "../libraries/DealingAsset.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract DealingAssetAction {
    modifier assetCleanUp() {
        cleanAssets();
        _;
        cleanAssets();
    }

    function getDealingAsset(address asset) internal view returns (bool) {
        return DealingAsset.get(asset);
    }

    function addDealingAsset(address asset) internal {
        if (!getDealingAsset(asset)) {
            DealingAsset.set(asset, true);
        }
    }

    function removeDealingAsset(address asset) internal {
        DealingAsset.set(asset, false);
    }

    function getDealingAssets() internal view returns (address[] memory) {
        return DealingAsset.assets();
    }

    function getDealingAssetLength() internal view returns (uint256) {
        return DealingAsset.getLength();
    }

    function cleanAssets() internal {
        DealingAsset.clean();
    }
}
