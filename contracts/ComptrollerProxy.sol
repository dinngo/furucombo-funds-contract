// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ComptrollerProxyAdmin} from "./ComptrollerProxyAdmin.sol";

/// @title The comptroller proxy
contract ComptrollerProxy is TransparentUpgradeableProxy {
    constructor(address logic_, bytes memory data_) TransparentUpgradeableProxy(logic_, msg.sender, data_) {
        ComptrollerProxyAdmin compAdmin = new ComptrollerProxyAdmin(TransparentUpgradeableProxy(this));
        compAdmin.transferOwnership(msg.sender);
        _changeAdmin(address(compAdmin));
    }
}
