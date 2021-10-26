// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

contract Comptroller is UpgradeableBeacon {
    constructor(address implementation_) UpgradeableBeacon(implementation_) {
        this;
    }
}
