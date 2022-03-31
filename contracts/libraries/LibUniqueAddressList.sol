// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibUniqueAddressList {
    using LibUniqueAddressList for List;

    address private constant _HEAD = address(0);
    address private constant _TAIL = address(0);
    address private constant _NULL = address(0);

    struct List {
        uint256 sz;
        mapping(address => address) predecessor;
        mapping(address => address) successor;
    }

    // Getters
    function _get(List storage self_) internal view returns (address[] memory list) {
        if (self_._empty()) {
            return list;
        } else {
            list = new address[](self_.sz);
            uint256 index = 0;
            for (address p = self_._front(); p != _TAIL; p = self_._next(p)) {
                list[index] = p;
                index++;
            }
        }
    }

    function _empty(List storage self_) internal view returns (bool) {
        return (self_.sz == 0);
    }

    function _size(List storage self_) internal view returns (uint256) {
        return self_.sz;
    }

    function _exist(List storage self_, address node_) internal view returns (bool) {
        return (self_.successor[node_] != _NULL);
    }

    function _front(List storage self_) internal view returns (address) {
        return self_.successor[_HEAD];
    }

    function _back(List storage self_) internal view returns (address) {
        return self_.predecessor[_TAIL];
    }

    function _next(List storage self_, address node_) internal view returns (address) {
        address n = self_.successor[node_];
        return node_ == n ? _TAIL : n;
    }

    function _prev(List storage self_, address node_) internal view returns (address) {
        address p = self_.predecessor[node_];
        return node_ == p ? _HEAD : p;
    }

    function _pushFront(List storage self_, address node_) internal returns (bool) {
        if (self_._exist(node_)) {
            return false;
        } else {
            address f = self_._front();
            _connect(self_, _HEAD, node_);
            _connect(self_, node_, f);
            self_.sz++;
            return true;
        }
    }

    function _pushBack(List storage self_, address node_) internal returns (bool) {
        if (self_._exist(node_)) {
            return false;
        } else {
            address b = self_._back();
            _connect(self_, b, node_);
            _connect(self_, node_, _TAIL);
            self_.sz++;
            return true;
        }
    }

    function _popFront(List storage self_) internal returns (bool) {
        if (self_._empty()) {
            return false;
        } else {
            address f = self_._front();
            address newFront = self_._next(f);
            _connect(self_, _HEAD, newFront);
            _delete(self_, f);
            return true;
        }
    }

    function _popBack(List storage self_) internal returns (bool) {
        if (self_._empty()) {
            return false;
        } else {
            address b = self_._back();
            address newBack = self_._prev(b);
            _connect(self_, newBack, _TAIL);
            _delete(self_, b);
            return true;
        }
    }

    function _insert(
        List storage self_,
        address loc_,
        address node_
    ) internal returns (bool) {
        if (loc_ == _NULL || node_ == _NULL) {
            return false;
        } else if (!self_._exist(loc_)) {
            return false;
        } else if (self_._exist(node_)) {
            return false;
        } else {
            address p = self_._prev(loc_);
            _connect(self_, p, node_);
            _connect(self_, node_, loc_);
            self_.sz++;
            return true;
        }
    }

    function _remove(List storage self_, address node_) internal returns (bool) {
        if (node_ == _NULL) {
            return false;
        } else if (!self_._exist(node_)) {
            return false;
        } else {
            address p = self_._prev(node_);
            address n = self_._next(node_);
            _connect(self_, p, n);
            _delete(self_, node_);
            return true;
        }
    }

    function _connect(
        List storage self_,
        address node1_,
        address node2_
    ) private {
        self_.successor[node1_] = node2_ == _TAIL ? node1_ : node2_;
        self_.predecessor[node2_] = node1_ == _HEAD ? node2_ : node1_;
    }

    function _delete(List storage self_, address node_) private {
        self_.predecessor[node_] = _NULL;
        self_.successor[node_] = _NULL;
        self_.sz--;
    }
}
