// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StorageArray} from "./StorageArray.sol";
import {StorageMap} from "./StorageMap.sol";

library DealingAsset {
    using StorageArray for bytes32;
    using StorageMap for bytes32;

    // Data is stored in storage slot `uint256(keccak256('furucombo.funds.asset.map')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _ASSET_MAP_SLOT = 0xa321fd097844f2df9aa8403ea06ed928267e143994398da9342e1622b5626151;

    // Data is stored in storage slot `uint256(keccak256('furucombo.funds.asset.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _ASSET_ARR_SLOT = 0x25241bfd865dc0cf716378d03594b4104571b985a2d5cf72950d41c4b7474874;

    bytes32 private constant _ASSET_TRUE_FLAG = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 private constant _ASSET_FALSE_FLAG = 0x0000000000000000000000000000000000000000000000000000000000000000;

    function _get(address key_) internal view returns (bool) {
        bytes32 key = bytes32(bytes20(key_));
        return _ASSET_MAP_SLOT._get(key) == _ASSET_TRUE_FLAG;
    }

    function _set(address key_, bool val_) internal {
        bytes32 key = bytes32(bytes20(key_));
        bytes32 oldVal = _ASSET_MAP_SLOT._get(key);

        if (oldVal == _ASSET_FALSE_FLAG) {
            _ASSET_ARR_SLOT._push(key);
        }

        if (val_) {
            _ASSET_MAP_SLOT._set(key, _ASSET_TRUE_FLAG);
        } else {
            _ASSET_MAP_SLOT._set(key, _ASSET_FALSE_FLAG);
        }
    }

    function _clean() internal {
        while (_ASSET_ARR_SLOT._getLength() > 0) {
            bytes32 key = _ASSET_ARR_SLOT._pop();
            _ASSET_MAP_SLOT._set(key, _ASSET_FALSE_FLAG);
        }
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
}
