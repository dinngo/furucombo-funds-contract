// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract DSProxyRegistryMock {
    mapping(address => address) public proxies;

    function build() external pure returns (address) {
        return address(0);
    }

    function setProxy(address owner_, address proxy_) external {
        proxies[owner_] = proxy_;
    }
}
