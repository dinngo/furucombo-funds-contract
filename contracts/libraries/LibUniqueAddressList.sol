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
    function _get(List storage self) internal view returns (address[] memory list) {
        if (self._empty()) {
            return list;
        } else {
            list = new address[](self.sz);
            uint256 index = 0;
            for (address p = self._front(); p != _TAIL; p = self._next(p)) {
                list[index] = p;
                index++;
            }
        }
    }

    function _empty(List storage self) internal view returns (bool) {
        return (self.sz == 0);
    }

    function _size(List storage self) internal view returns (uint256) {
        return self.sz;
    }

    function _exist(List storage self, address node) internal view returns (bool) {
        return (self.successor[node] != _NULL);
    }

    function _front(List storage self) internal view returns (address) {
        return self.successor[_HEAD];
    }

    function _back(List storage self) internal view returns (address) {
        return self.predecessor[_TAIL];
    }

    function _next(List storage self, address node) internal view returns (address) {
        address n = self.successor[node];
        return node == n ? _TAIL : n;
    }

    function _prev(List storage self, address node) internal view returns (address) {
        address p = self.predecessor[node];
        return node == p ? _HEAD : p;
    }

    // Modifiers
    function _pushFront(List storage self, address node) internal returns (bool) {
        if (self._exist(node)) {
            return false;
        } else {
            address f = self._front();
            _connect(self, _HEAD, node);
            _connect(self, node, f);
            self.sz++;
            return true;
        }
    }

    function _pushBack(List storage self, address node) internal returns (bool) {
        if (self._exist(node)) {
            return false;
        } else {
            address b = self._back();
            _connect(self, b, node);
            _connect(self, node, _TAIL);
            self.sz++;
            return true;
        }
    }

    function _popFront(List storage self) internal returns (bool) {
        if (self._empty()) {
            return false;
        } else {
            address f = self._front();
            address newFront = self._next(f);
            _connect(self, _HEAD, newFront);
            _delete(self, f);
            return true;
        }
    }

    function _popBack(List storage self) internal returns (bool) {
        if (self._empty()) {
            return false;
        } else {
            address b = self._back();
            address newBack = self._prev(b);
            _connect(self, newBack, _TAIL);
            _delete(self, b);
            return true;
        }
    }

    function _insert(
        List storage self,
        address loc,
        address node
    ) internal returns (bool) {
        if (loc == _NULL || node == _NULL) {
            return false;
        } else if (!self._exist(loc)) {
            return false;
        } else if (self._exist(node)) {
            return false;
        } else {
            address p = self._prev(loc);
            _connect(self, p, node);
            _connect(self, node, loc);
            self.sz++;
            return true;
        }
    }

    function _remove(List storage self, address node) internal returns (bool) {
        if (node == _NULL) {
            return false;
        } else if (!self._exist(node)) {
            return false;
        } else {
            address p = self._prev(node);
            address n = self._next(node);
            _connect(self, p, n);
            _delete(self, node);
            return true;
        }
    }

    function _connect(
        List storage self,
        address node1,
        address node2
    ) private {
        self.successor[node1] = node2 == _TAIL ? node1 : node2;
        self.predecessor[node2] = node1 == _HEAD ? node2 : node1;
    }

    function _delete(List storage self, address node) private {
        self.predecessor[node] = _NULL;
        self.successor[node] = _NULL;
        self.sz--;
    }
}
