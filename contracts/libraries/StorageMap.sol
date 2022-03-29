// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageMap {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot) private pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot
        }
    }

    function _get(bytes32 slot, bytes32 key) internal view returns (bytes32 ret) {
        bytes32 b = keccak256(abi.encodePacked(key, uint256(slot)));
        ret = _getSlot(b).value;
    }

    function _set(
        bytes32 slot,
        bytes32 key,
        bytes32 val
    ) internal {
        bytes32 b = keccak256(abi.encodePacked(key, uint256(slot)));
        _getSlot(b).value = val;
    }
}
