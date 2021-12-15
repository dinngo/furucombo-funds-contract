// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {AssetModule} from "../modules/AssetModule.sol";
import {BaseMock} from "./BaseMock.sol";

contract AssetModuleMock is AssetModule, BaseMock {
    constructor(IDSProxyRegistry dsProxyRegistry_) BaseMock(dsProxyRegistry_) {}
}
