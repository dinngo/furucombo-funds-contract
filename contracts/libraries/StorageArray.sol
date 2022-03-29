// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageArray {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot_) private pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot_
        }
    }

    function _get(bytes32 slot_, uint256 index_) internal view returns (bytes32 val) {
        require(index_ < uint256(_getSlot(slot_).value), "StorageArray: _get invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot_)))) + index_;
        val = _getSlot(bytes32(s)).value;
    }

    function _set(
        bytes32 slot_,
        uint256 index_,
        bytes32 val_
    ) internal {
        require(index_ < uint256(_getSlot(slot_).value), "StorageArray: _set invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot_)))) + index_;

        bytes32 val = bytes32(bytes20(val_));
        _getSlot(bytes32(s)).value = val;
    }

    function _push(bytes32 slot_, bytes32 val_) internal {
        uint256 length = uint256(_getSlot(slot_).value);
        _getSlot(slot_).value = bytes32(length + 1);
        _set(slot_, length, val_);
    }

    function _pop(bytes32 slot_) internal returns (bytes32 val) {
        uint256 length = uint256(_getSlot(slot_).value);
        require(length > 0, "StorageArray: empty array");

        length -= 1;
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot_)))) + length;
        val = _getSlot(bytes32(s)).value;
        _getSlot(bytes32(s)).value = 0;
        _getSlot(slot_).value = bytes32(length);
    }

    function _getLength(bytes32 slot_) internal view returns (uint256) {
        return uint256(_getSlot(slot_).value);
    }
}
