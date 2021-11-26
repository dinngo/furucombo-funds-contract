// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../furucombo/Proxy.sol";
import "../debug/GasProfiler.sol";

contract FurucomboProxyMock is FurucomboProxy, GasProfiler {
    using LibStack for bytes32[];

    constructor(address registry) FurucomboProxy(registry) {}

    event RecordHandlerResult(bytes value);

    function execMock(address to, bytes memory data)
        external
        payable
        returns (bytes memory result)
    {
        _preProcess();
        _setBase();
        result = _exec(to, data);
        _setPostProcess(to);
        _deltaGas("Gas");
        _postProcess();
        emit RecordHandlerResult(result);
        return result;
    }

    function _preProcess() internal override {
        // Set the sender.
        _setSender();
    }

    function updateTokenMock(address token) public {
        stack.setAddress(token);
    }
}
