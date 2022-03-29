// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

contract DynamicHandler is HandlerBase {
    event FooBytes32(bytes32 a);
    event FooUint256(uint256 b);

    function getContractName() public pure override returns (string memory) {
        return "DynamicHandler";
    }

    function summitUint(uint256 v_) external payable returns (uint256) {
        return v_ + 1;
    }

    function summitAddress(address v_) external payable returns (address) {
        return v_;
    }

    function summitAddressFixArray(address[2] calldata addrs_) external payable returns (address) {
        return addrs_[0];
    }

    function summitUintDynamicArray(uint256[] calldata amounts_) external payable returns (uint256) {
        return amounts_[0];
    }

    function summitAddressDynamicArray(address[] calldata addrs_) external payable returns (address) {
        return addrs_[0];
    }

    function summitMultiple(
        uint256 a_,
        address b_,
        address[] calldata addrs_,
        uint256[] calldata amounts_
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
