// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageMap {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot_) private pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot_
        }
    }

    function _get(bytes32 slot_, bytes32 key_) internal view returns (bytes32 ret) {
        bytes32 b = keccak256(abi.encodePacked(key_, uint256(slot_)));
        ret = _getSlot(b).value;
    }

    function _set(
        bytes32 slot_,
        bytes32 key_,
        bytes32 val_
    ) internal {
        bytes32 b = keccak256(abi.encodePacked(key_, uint256(slot_)));
        _getSlot(b).value = val_;
    }
}
