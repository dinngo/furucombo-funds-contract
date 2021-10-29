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
    function get(List storage self)
        internal
        view
        returns (address[] memory list)
    {
        list = new address[](self.sz);
        uint256 index = 0;
        for (
            address p = self.successor[_HEAD];
            self.successor[p] != _NULL;
            p = self.successor[p]
        ) {
            list[index] = p;
            index++;
        }
    }

    function empty(List storage self) internal view returns (bool) {
        return (self.sz == 0);
    }

    function size(List storage self) internal view returns (uint256) {
        return self.sz;
    }

    function exist(List storage self, address node)
        internal
        view
        returns (bool)
    {
        return (self.successor[node] != _NULL);
    }

    function front(List storage self) internal view returns (address) {
        return self.successor[_HEAD];
    }

    function back(List storage self) internal view returns (address) {
        return self.predecessor[_TAIL];
    }

    function next(List storage self, address node)
        internal
        view
        returns (address)
    {
        return self.successor[node];
    }

    function prev(List storage self, address node)
        internal
        view
        returns (address)
    {
        return self.predecessor[node];
    }

    // Modifiers

    function pushFront(List storage self, address node)
        internal
        returns (bool)
    {
        address f = self.front();
        self.successor[_HEAD] = node;
        _connect(self, node, f);
        self.predecessor[node] = node;
        self.sz++;
        return true;
    }

    function pushBack(List storage self, address node) internal returns (bool) {
        address b = self.back();
        self.predecessor[_TAIL] = node;
        _connect(self, b, node);
        self.successor[node] = node;
        self.sz++;
        return true;
    }

    function popFront(List storage self) internal returns (bool) {
        if (self.empty()) {
            return false;
        } else {
            address f = self.front();
            address newFront = self.next(f);
            _delete(self, f);
            self.successor[_HEAD] = newFront;
            self.predecessor[newFront] = newFront;
            return true;
        }
    }

    function popBack(List storage self) internal returns (bool) {
        if (self.empty()) {
            return false;
        } else {
            address b = self.back();
            address newBack = self.prev(b);
            _delete(self, b);
            self.predecessor[_TAIL] = newBack;
            self.successor[newBack] = newBack;
            return true;
        }
    }

    function insert(
        List storage self,
        address loc,
        address node
    ) internal returns (bool) {
        if (loc == _NULL || node == _NULL) {
            return false;
        } else if (!self.exist(loc)) {
            return false;
        } else if (self.exist(node)) {
            return false;
        } else {
            address p = self.prev(loc);
            _connect(self, p, node);
            _connect(self, node, loc);
            self.sz++;
            return true;
        }
    }

    function remove(List storage self, address node) internal returns (bool) {
        if (node == _NULL) {
            return false;
        } else if (!self.exist(node)) {
            return false;
        } else {
            address p = self.prev(node);
            address n = self.next(node);
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
        self.successor[node1] = node2;
        self.predecessor[node2] = node1;
    }

    function _delete(List storage self, address node) private {
        self.predecessor[node] = _NULL;
        self.successor[node] = _NULL;
        self.sz--;
    }
}
