// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {StorageArray} from "./StorageArray.sol";
import {StorageMap} from "./StorageMap.sol";

library FundQuota {
    using StorageArray for bytes32;
    using StorageMap for bytes32;

    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.quota.map')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _QUOTA_MAP_SLOT =
        0x2b788f7bcb8450fcfa384e3745f09c0bac6c160b8fc795c1a07d087fd7da0a36;

    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.quota.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 private constant _QUOTA_ARR_SLOT =
        0x5ed6d3693c7c47d16b35cceff2738deb653860111a238f4d7574bbeba1ea6bc0;

    function get(address _key) internal view returns (uint256) {
        bytes32 key = bytes32(bytes20(_key));
        return uint256(_QUOTA_MAP_SLOT.get(key));
    }

    function set(address _key, uint256 _val) internal {
        bytes32 key = bytes32(bytes20(_key));
        uint256 oldVal = uint256(_QUOTA_MAP_SLOT.get(key));
        if (oldVal == 0) {
            _QUOTA_ARR_SLOT.push(key);
        }

        bytes32 val = bytes32(_val);
        _QUOTA_MAP_SLOT.set(key, val);
    }

    function clean() internal {
        while (_QUOTA_ARR_SLOT.getLength() > 0) {
            bytes32 key = _QUOTA_ARR_SLOT.pop();
            _QUOTA_MAP_SLOT.set(key, 0);
        }
    }
}
