// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

contract Foo6Handler is HandlerBase {
    function getContractName() public pure override returns (string memory) {
        return "Foo6Handler";
    }

    function injects(address[] calldata tokens_) public payable {
        for (uint256 i = 0; i < tokens_.length; i++) {
            _updateInitialToken(tokens_[i]);
        }
    }

    function dealing(address[] calldata tokens_) public payable {
        for (uint256 i = 0; i < tokens_.length; i++) {
            _updateToken(tokens_[i]);
        }
    }
}
