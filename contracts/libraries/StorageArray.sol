// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library StorageArray {
    struct Slot {
        bytes32 value;
    }

    function _getSlot(bytes32 slot_) internal pure returns (Slot storage ret) {
        assembly {
            ret.slot := slot_
        }
    }

    function get(bytes32 slotIndex, uint256 index)
        public
        view
        returns (bytes32 val)
    {
        require(index < uint256(_getSlot(slotIndex).value), "invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slotIndex)))) +
            index;
        val = _getSlot(bytes32(s)).value;
    }

    function set(
        bytes32 slotIndex,
        uint256 index,
        bytes32 val
    ) public {
        require(index < uint256(_getSlot(slotIndex).value), "invalid index");
        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slotIndex)))) +
            index;

        bytes32 _val = bytes32(bytes20(val));
        _getSlot(bytes32(s)).value = _val;
    }

    function push(bytes32 slotIndex, bytes32 val) public {
        uint256 length = uint256(_getSlot(slotIndex).value);
        set(slotIndex, length, val);
        _getSlot(slotIndex).value = bytes32(++length);
    }

    function pop(bytes32 slotIndex) public returns (bytes32 val) {
        uint256 length = uint256(_getSlot(slotIndex).value);
        require(length > 0, "empty array");

        uint256 s = uint256(keccak256(abi.encodePacked(uint256(slotIndex)))) +
            --length;

        val = _getSlot(bytes32(s)).value;
        _getSlot(bytes32(s)).value = 0;
        _getSlot(slotIndex).value = bytes32(length);
    }

    function getLength(bytes32 slotIndex) public view returns (uint256) {
        return uint256(_getSlot(slotIndex).value);
    }
}
