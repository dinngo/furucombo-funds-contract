// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";

/// @title The proxy contract of fund
contract FundProxy is BeaconProxy {
    constructor(address beacon_, bytes memory data_) payable BeaconProxy(beacon_, data_) {
        this;
    }
}
