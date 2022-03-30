// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

contract Foo5Handler is HandlerBase {
    function getContractName() public pure override returns (string memory) {
        return "Foo5Handler";
    }

    function exec(address target_, bytes memory data_) public payable returns (bytes memory response) {
        (bool ok, bytes memory ret) = target_.call{value: msg.value}(data_);
        require(ok, string(ret));
        response = ret;
    }

    function bar() public pure returns (bool) {
        return true;
    }
}
