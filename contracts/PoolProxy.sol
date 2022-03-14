// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool} from "./interfaces/IPool.sol";

contract PoolProxy is BeaconProxy {
    constructor(address beacon, bytes memory data)
        payable
        BeaconProxy(beacon, data)
    {
        this;
    }
}
