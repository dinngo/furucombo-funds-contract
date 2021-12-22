// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {ActionBase} from "../actions/ActionBase.sol";

contract AMock is ActionBase {
    function doUint(uint256 _u) external payable returns (uint256) {
        return _u;
    }

    function doAddress(address _a) external payable returns (address) {
        return _a;
    }

    function doAddDealingAsset(address _a) external payable {
        addDealingAsset(_a);
    }

    function doGetDealingAsset(address _a) external view returns (bool) {
        return getDealingAsset(_a);
    }

    function doGetDealingAssets() external view returns (address[] memory) {
        return getDealingAssets();
    }

    function doRemoveDealingAsset(address asset) external {
        removeDealingAsset(asset);
    }

    function doCleanAssets() external {
        cleanAssets();
    }

    function doGetLength() external view returns (uint256) {
        return getDealingAssetLength();
    }

    function doAssetCleanUp(address _a) external assetCleanUp {
        addDealingAsset(_a);
    }

    // Fund Quota functions

    function doGetFundQuota(address _a) external view returns (uint256) {
        return getFundQuota(_a);
    }

    function doIsFundQuotaZero(address _a) external view returns (bool) {
        return isFundQuotaZero(_a);
    }

    function doSetFundQuota(address _a, uint256 _v) external {
        setFundQuota(_a, _v);
    }

    function doIncreaseFundQuota(address _a, uint256 _v) external {
        increaseFundQuota(_a, _v);
    }

    function doDecreaseFundQuota(address _a, uint256 _v) external {
        decreaseFundQuota(_a, _v);
    }

    function doCleanFundQuota() external {
        cleanFundQuota();
    }

    function doQuotaCleanUp(address _a, uint256 _v) external quotaCleanUp {
        increaseFundQuota(_a, _v);
    }
}
