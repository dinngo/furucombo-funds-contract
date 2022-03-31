// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Foo4} from "./Foo4.sol";
import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

contract Foo4Handler is HandlerBase {
    event FooBytes32(bytes32 a_);
    event FooUint256(uint256 b_);

    function getContractName() public pure override returns (string memory) {
        return "Foo4Handler";
    }

    function bar(address to_) external payable returns (bytes32 ret) {
        ret = Foo4(to_).bar();
    }

    function barUint(address to_) external payable returns (uint256 ret) {
        ret = Foo4(to_).barUint();
    }

    function bar1(address to_, bytes32 a_) external payable returns (bytes32 ret) {
        ret = Foo4(to_).bar1(a_);
    }

    function bar2(
        address to_,
        bytes32 a_,
        bytes32 b_
    ) external payable returns (bytes32 ret) {
        ret = Foo4(to_).bar2(a_, b_);
    }

    function barUint1(address to_, uint256 a_) external payable returns (uint256 ret) {
        ret = Foo4(to_).barUint1(a_);
    }

    function barUList(
        address to_,
        uint256 a_,
        uint256 b_,
        uint256 c_
    ) external payable returns (uint256[] memory ret) {
        ret = Foo4(to_).barUList(a_, b_, c_);
    }
}
