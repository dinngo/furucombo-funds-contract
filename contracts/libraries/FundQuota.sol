// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StorageArray.sol";
import "./StorageMap.sol";

library FundQuota {
    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.quota.map')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 internal constant _QUOTA_MAP_SLOT =
        0x2b788f7bcb8450fcfa384e3745f09c0bac6c160b8fc795c1a07d087fd7da0a36;

    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.quota.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 internal constant _QUOTA_ARR_SLOT =
        0x5ed6d3693c7c47d16b35cceff2738deb653860111a238f4d7574bbeba1ea6bc0;

    function get(address _key) internal view returns (uint256) {
        bytes32 key = bytes32(bytes20(_key));
        return uint256(StorageMap.get(_QUOTA_MAP_SLOT, key));
    }

    function set(address _key, uint256 _val) internal {
        bytes32 key = bytes32(bytes20(_key));
        uint256 oldVal = uint256(StorageMap.get(_QUOTA_MAP_SLOT, key));
        bytes32 val = bytes32(_val);
        StorageMap.set(_QUOTA_MAP_SLOT, key, val);
        if (oldVal == 0) {
            StorageArray.push(_QUOTA_ARR_SLOT, key);
        }
    }

    function clean() internal {
        while (StorageArray.getLength(_QUOTA_ARR_SLOT) > 0) {
            bytes32 key = StorageArray.pop(_QUOTA_ARR_SLOT);
            StorageMap.set(_QUOTA_MAP_SLOT, key, 0);
        }
    }
}
