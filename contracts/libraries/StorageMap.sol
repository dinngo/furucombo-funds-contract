// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageMap {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot_) internal pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot_
        }
    }

    function get(bytes32 slotIndex, bytes32 key)
        public
        view
        returns (bytes32 ret)
    {
        bytes32 b = keccak256(abi.encodePacked(key, uint256(slotIndex)));
        ret = _getSlot(b).value;
    }

    function set(
        bytes32 slotIndex,
        bytes32 key,
        bytes32 val
    ) public {
        bytes32 b = keccak256(abi.encodePacked(key, uint256(slotIndex)));
        _getSlot(b).value = val;
    }
}
