// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./StorageArray.sol";
import "./StorageMap.sol";

library Bucket {
    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.bucket.map')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 internal constant _BUCKET_MAP_SLOT =
        0xf97f9ba6663217f0ae33adef9b1aec68f50579377a17fe8ee3875026f393176e;

    // Data is stored in storage slot `uint256(keccak256('furucombo.poolcombo.bucket.array')) - 1`, so that it doesn't
    // conflict with the storage layout of the implementation behind the proxy.
    bytes32 internal constant _BUCKET_ARR_SLOT =
        0xa0893a2d4bbe9cd0c2068429585960a0c231285bd5457a607ab66f1355db5b90;

    function get(address _key) internal view returns (uint256) {
        bytes32 key = bytes32(bytes20(_key));
        return uint256(StorageMap.get(_BUCKET_MAP_SLOT, key));
    }

    function set(address _key, uint256 _val) internal {
        bytes32 key = bytes32(bytes20(_key));
        bytes32 val = bytes32(_val);
        StorageMap.set(_BUCKET_MAP_SLOT, key, val);
        StorageArray.push(_BUCKET_ARR_SLOT, key);
    }

    function reset() internal {
        while (StorageArray.getLength(_BUCKET_ARR_SLOT) > 0) {
            bytes32 key = StorageArray.pop(_BUCKET_ARR_SLOT);
            StorageMap.set(_BUCKET_MAP_SLOT, key, 0);
        }
    }
}
