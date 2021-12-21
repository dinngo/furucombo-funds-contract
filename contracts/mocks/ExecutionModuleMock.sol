// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {ExecutionModule} from "../modules/ExecutionModule.sol";
import {BaseMock} from "./BaseMock.sol";

contract ExecutionModuleMock is ExecutionModule, BaseMock {
    constructor(IDSProxyRegistry dsProxyRegistry_) BaseMock(dsProxyRegistry_) {}

    event BeforeExecuteCalled();
    event AfterExecuteCalled();

    function _beforeExecute() internal override returns (bool) {
        emit BeforeExecuteCalled();
        return super._beforeExecute();
    }

    function _afterExecute() internal override returns (bool) {
        emit AfterExecuteCalled();
        return super._afterExecute();
    }
}
