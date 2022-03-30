// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FurucomboProxy, LibStack} from "../../furucombo/Proxy.sol";
import {GasProfiler} from "../debug/GasProfiler.sol";
import "../../furucombo/interfaces/IRegistry.sol";

contract FurucomboProxyMock is FurucomboProxy, GasProfiler {
    using LibStack for bytes32[];

    constructor(IRegistry registry_) FurucomboProxy(registry_) {}

    event RecordHandlerResult(bytes value);

    function execMock(address to_, bytes memory data_) external payable returns (bytes memory result) {
        _preProcess();
        _setBase();
        result = _exec(to_, data_, 0);
        _setPostProcess(to_);
        _deltaGas("Gas");
        _postProcess();
        emit RecordHandlerResult(result);
        return result;
    }

    function execMockNotRefund(address to_, bytes memory data_) external payable returns (bytes memory result) {
        _preProcess();
        _setBase();
        result = _exec(to_, data_, 0);
        _setPostProcess(to_);
        _deltaGas("Gas");
        emit RecordHandlerResult(result);
        return result;
    }

    function _preProcess() internal override {
        // Set the sender.
        _setSender();
    }

    function updateTokenMock(address token_) public {
        stack.setAddress(token_);
    }
}
