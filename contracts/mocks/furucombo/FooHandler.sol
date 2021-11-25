// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../../furucombo/handlers/HandlerBase.sol";

interface IFoo {
    function bar(uint256 a) external returns (uint256 result);
}

interface IFooFactory {
    function addressOf(uint256 index) external view returns (address result);

    function createFoo() external;
}

contract FooHandler is HandlerBase {
    address public immutable factory;

    constructor(address _factory) {
        factory = _factory;
    }

    function getContractName() public pure override returns (string memory) {
        return "Foo2Handler";
    }

    function getFooFactory() public view returns (address target) {
        return factory;
    }

    function getFoo(uint256 index) public view returns (address target) {
        return IFooFactory(getFooFactory()).addressOf(index);
    }

    function bar(uint256 index, uint256 a) public returns (uint256 result) {
        address target = getFoo(index);
        return IFoo(target).bar(a);
    }
}
