// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StorageArray} from "./StorageArray.sol";
import {StorageMap} from "./StorageMap.sol";

library FundQuota {
    using StorageArray for bytes32;
    using StorageMap for bytes32;

    // Data is stored in storage slot `uint256(keccak256('furucombo.funds.quota.map')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _QUOTA_MAP_SLOT = 0x1af59a3fd3f5a4bba6259b5a65dd4f4fbaab48545aeeabdfb60969120dbd5c35;

    // Data is stored in storage slot `uint256(keccak256('furucombo.funds.quota.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _QUOTA_ARR_SLOT = 0x041334f809138adff4aed76ee4e45b3671e485ee2dcac112682c24d3a0c21736;

    function _get(address key_) internal view returns (uint256) {
        bytes32 key = bytes32(bytes20(key_));
        return uint256(_QUOTA_MAP_SLOT._get(key));
    }

    function _set(address key_, uint256 val_) internal {
        bytes32 key = bytes32(bytes20(key_));
        uint256 oldVal = uint256(_QUOTA_MAP_SLOT._get(key));
        if (oldVal == 0) {
            _QUOTA_ARR_SLOT._push(key);
        }

        bytes32 val = bytes32(val_);
        _QUOTA_MAP_SLOT._set(key, val);
    }

    function _clean() internal {
        while (_QUOTA_ARR_SLOT._getLength() > 0) {
            bytes32 key = _QUOTA_ARR_SLOT._pop();
            _QUOTA_MAP_SLOT._set(key, 0);
        }
    }
}
