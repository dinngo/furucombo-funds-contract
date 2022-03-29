// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageArray {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot) private pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot
        }
    }

    function _get(bytes32 slot, uint256 index) internal view returns (bytes32 val) {
        require(index < uint256(_getSlot(slot).value), "StorageArray: _get invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot)))) + index;
        val = _getSlot(bytes32(s)).value;
    }

    function _set(
        bytes32 slot,
        uint256 index,
        bytes32 val
    ) internal {
        require(index < uint256(_getSlot(slot).value), "StorageArray: _set invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot)))) + index;

        bytes32 _val = bytes32(bytes20(val));
        _getSlot(bytes32(s)).value = _val;
    }

    function _push(bytes32 slot, bytes32 val) internal {
        uint256 length = uint256(_getSlot(slot).value);
        _getSlot(slot).value = bytes32(length + 1);
        _set(slot, length, val);
    }

    function _pop(bytes32 slot) internal returns (bytes32 val) {
        uint256 length = uint256(_getSlot(slot).value);
        require(length > 0, "StorageArray: empty array");

        length -= 1;
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slot)))) + length;
        val = _getSlot(bytes32(s)).value;
        _getSlot(bytes32(s)).value = 0;
        _getSlot(slot).value = bytes32(length);
    }

    function _getLength(bytes32 slot) internal view returns (uint256) {
        return uint256(_getSlot(slot).value);
    }
}
