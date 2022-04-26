// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ActionBase} from "../actions/ActionBase.sol";

contract ActionMock is ActionBase {
    function doUint(uint256 u_) external payable returns (uint256) {
        return u_;
    }

    function doAddress(address a_) external payable returns (address) {
        return a_;
    }

    function doAddDealingAsset(address a_) external payable {
        _addDealingAsset(a_);
    }

    function doIsDealingAssetExist(address a_) external view returns (bool) {
        return _isDealingAssetExist(a_);
    }

    function doGetDealingAssets() external view returns (address[] memory) {
        return _getDealingAssets();
    }

    function doCleanAssets() external {
        _cleanAssets();
    }

    function doGetLength() external view returns (uint256) {
        return _getDealingAssetLength();
    }

    function doAssetCleanUp(address a_) external assetCleanUp {
        _addDealingAsset(a_);
    }

    // Asset Quota functions

    function doGetAssetQuota(address a_) external view returns (uint256) {
        return _getAssetQuota(a_);
    }

    function doIsAssetQuotaZero(address a_) external view returns (bool) {
        return _isAssetQuotaZero(a_);
    }

    function doSetAssetQuota(address a_, uint256 v_) external {
        _setAssetQuota(a_, v_);
    }

    function doIncreaseAssetQuota(address a_, uint256 v_) external {
        _increaseAssetQuota(a_, v_);
    }

    function doDecreaseAssetQuota(address a_, uint256 v_) external {
        _decreaseAssetQuota(a_, v_);
    }

    function doCleanAssetQuota() external {
        _cleanAssetQuota();
    }

    function doQuotaCleanUp(address a_, uint256 v_) external quotaCleanUp {
        _increaseAssetQuota(a_, v_);
    }
}
