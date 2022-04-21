// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ActionBase} from "../actions/ActionBase.sol";

contract AMock is ActionBase {
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

    // Fund Quota functions

    function doGetFundQuota(address a_) external view returns (uint256) {
        return _getFundQuota(a_);
    }

    function doIsFundQuotaZero(address a_) external view returns (bool) {
        return _isFundQuotaZero(a_);
    }

    function doSetFundQuota(address a_, uint256 v_) external {
        _setFundQuota(a_, v_);
    }

    function doIncreaseFundQuota(address a_, uint256 v_) external {
        _increaseFundQuota(a_, v_);
    }

    function doDecreaseFundQuota(address a_, uint256 v_) external {
        _decreaseFundQuota(a_, v_);
    }

    function doCleanFundQuota() external {
        _cleanFundQuota();
    }

    function doQuotaCleanUp(address a_, uint256 v_) external quotaCleanUp {
        _increaseFundQuota(a_, v_);
    }
}
