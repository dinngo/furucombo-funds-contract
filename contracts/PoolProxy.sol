// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPool} from "./interfaces/IPool.sol";

contract PoolProxy is BeaconProxy {
    constructor(address beacon, bytes memory data)
        payable
        BeaconProxy(beacon, data)
    {
        // May move to factory and assign directly to user through data
        IPool(address(this)).initializeOwnership(msg.sender);
    }
}
