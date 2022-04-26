// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AssetQuota} from "../libraries/AssetQuota.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract AssetQuotaAction {
    modifier quotaCleanUp() {
        _cleanAssetQuota();
        _;
        _cleanAssetQuota();
    }

    function _getAssetQuota(address asset_) internal view returns (uint256) {
        return AssetQuota._get(asset_);
    }

    function _isAssetQuotaZero(address asset_) internal view returns (bool) {
        return _getAssetQuota(asset_) == 0;
    }

    function _setAssetQuota(address asset_, uint256 quota_) internal {
        AssetQuota._set(asset_, quota_);
    }

    function _increaseAssetQuota(address asset_, uint256 quota_) internal {
        uint256 oldQuota = AssetQuota._get(asset_);
        _setAssetQuota(asset_, oldQuota + quota_);
    }

    function _decreaseAssetQuota(address asset_, uint256 quota_) internal {
        uint256 oldQuota = AssetQuota._get(asset_);
        _setAssetQuota(asset_, oldQuota - quota_);
    }

    function _cleanAssetQuota() internal {
        AssetQuota._clean();
    }
}
