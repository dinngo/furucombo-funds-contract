// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ComptrollerProxyAdmin} from "./ComptrollerProxyAdmin.sol";

contract ComptrollerProxy is TransparentUpgradeableProxy {
    constructor(address logic_, bytes memory data_)
        payable
        TransparentUpgradeableProxy(logic_, msg.sender, data_)
    {
        ComptrollerProxyAdmin admin = new ComptrollerProxyAdmin(
            TransparentUpgradeableProxy(this)
        );
        admin.transferOwnership(msg.sender);
        _changeAdmin(address(admin));
    }
}
