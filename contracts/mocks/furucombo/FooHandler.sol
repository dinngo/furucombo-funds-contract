// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

interface IFoo {
    function bar(uint256 a_) external returns (uint256 result);
}

interface IFooFactory {
    function addressOf(uint256 index_) external view returns (address result);

    function createFoo() external;
}

contract FooHandler is HandlerBase {
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
        return IFooFactory(getFooFactory()).addressOf(index_);
    }

    function bar(uint256 index_, uint256 a_) public returns (uint256 result) {
        address target = getFoo(index_);
        return IFoo(target).bar(a_);
    }
}
