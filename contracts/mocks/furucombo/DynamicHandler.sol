// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

contract DynamicHandler is HandlerBase {
    event FooBytes32(bytes32 a);
    event FooUint256(uint256 b);

    function getContractName() public pure override returns (string memory) {
        return "DynamicHandler";
    }

    function summitUint(uint256 v) external payable returns (uint256) {
        return v + 1;
    }

    function summitAddress(address v) external payable returns (address) {
        return v;
    }

    function summitAddressFixArray(address[2] calldata addrs) external payable returns (address) {
        return addrs[0];
    }

    function summitUintDynamicArray(uint256[] calldata amounts) external payable returns (uint256) {
        return amounts[0];
    }

    function summitAddressDynamicArray(address[] calldata addrs) external payable returns (address) {
        return addrs[0];
    }

    function summitMultiple(
        uint256 a,
        address b,
        address[] calldata addrs,
        uint256[] calldata amounts
    )
        external
        payable
        returns (
            uint256,
            address,
            address[] memory,
            uint256[] memory
        )
    {}
}
