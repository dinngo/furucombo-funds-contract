// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DSProxyMock {
    address public owner;

    function setOwner(address owner_) external {
        owner = owner_;
    }
}
