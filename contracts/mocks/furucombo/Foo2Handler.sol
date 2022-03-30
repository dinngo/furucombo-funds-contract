// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

interface IFoo2 {
    function bar() external payable returns (uint256 result);
}

interface IFoo2Factory {
    function addressOf(uint256 index_) external view returns (address result);

    function createFoo() external;
}

contract Foo2Handler is HandlerBase {
    address public immutable factory;

    constructor(address factory_) {
        factory = factory_;
    }

    function getContractName() public pure override returns (string memory) {
        return "Foo2Handler";
    }

    function getFooFactory() public view returns (address target) {
        return factory;
    }

    function getFoo(uint256 index_) public view returns (address target) {
        return IFoo2Factory(getFooFactory()).addressOf(index_);
    }

    function bar(uint256 value_, uint256 index_) public payable returns (uint256 result) {
        address target = getFoo(index_);
        _updateToken(target);
        return IFoo2(target).bar{value: value_}();
    }
}
