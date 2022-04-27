// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StorageArray} from "./StorageArray.sol";

library DealingAsset {
    using StorageArray for bytes32;

    // Data is stored in storage slot `uint256(keccak256('furucombo.funds.asset.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _ASSET_ARR_SLOT = 0x25241bfd865dc0cf716378d03594b4104571b985a2d5cf72950d41c4b7474874;

    function _add(address asset_) internal {
        if (!_exist(asset_)) {
            bytes32 asset = bytes32(bytes20(asset_));
            _ASSET_ARR_SLOT._push(asset);
        }
    }

    function _clean() internal {
        _ASSET_ARR_SLOT._delete();
    }

    function _assets() internal view returns (address[] memory) {
        uint256 length = _ASSET_ARR_SLOT._getLength();
        address[] memory assets = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            assets[i] = address(bytes20(_ASSET_ARR_SLOT._get(i)));
        }
        return assets;
    }

    function _getLength() internal view returns (uint256) {
        return _ASSET_ARR_SLOT._getLength();
    }

    function _exist(address asset_) internal view returns (bool) {
        for (uint256 i = 0; i < _ASSET_ARR_SLOT._getLength(); i++) {
            if (asset_ == address(bytes20(_ASSET_ARR_SLOT._get(i)))) {
                return true;
            }
        }
        return false;
    }
}
