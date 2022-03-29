// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ActionBase} from "../actions/ActionBase.sol";

contract AMock is ActionBase {
    function doUint(uint256 _u) external payable returns (uint256) {
        return _u;
    }

    function doAddress(address _a) external payable returns (address) {
        return _a;
    }

    function doAddDealingAsset(address _a) external payable {
        _addDealingAsset(_a);
    }

    function doGetDealingAsset(address _a) external view returns (bool) {
        return _getDealingAsset(_a);
    }

    function doGetDealingAssets() external view returns (address[] memory) {
        return _getDealingAssets();
    }

    function doRemoveDealingAsset(address asset) external {
        _removeDealingAsset(asset);
    }

    function doCleanAssets() external {
        _cleanAssets();
    }

    function doGetLength() external view returns (uint256) {
        return _getDealingAssetLength();
    }

    function doAssetCleanUp(address _a) external assetCleanUp {
        _addDealingAsset(_a);
    }

    // Fund Quota functions

    function doGetFundQuota(address _a) external view returns (uint256) {
        return _getFundQuota(_a);
    }

    function doIsFundQuotaZero(address _a) external view returns (bool) {
        return _isFundQuotaZero(_a);
    }

    function doSetFundQuota(address _a, uint256 _v) external {
        _setFundQuota(_a, _v);
    }

    function doIncreaseFundQuota(address _a, uint256 _v) external {
        _increaseFundQuota(_a, _v);
    }

    function doDecreaseFundQuota(address _a, uint256 _v) external {
        _decreaseFundQuota(_a, _v);
    }

    function doCleanFundQuota() external {
        _cleanFundQuota();
    }

    function doQuotaCleanUp(address _a, uint256 _v) external quotaCleanUp {
        _increaseFundQuota(_a, _v);
    }
}
