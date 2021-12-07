// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {ShareModule} from "../modules/ShareModule.sol";
import {BaseMock} from "./BaseMock.sol";

contract ShareModuleMock is ShareModule, BaseMock {
    uint256 public reserveMock;
    uint256 public totalAssetValueMock;

    constructor(IDSProxyRegistry dsProxyRegistry_) BaseMock(dsProxyRegistry_) {}

    function setReserve(uint256 amount) external {
        reserveMock = amount;
    }

    function setTotalAssetValue(uint256 amount) external {
        totalAssetValueMock = amount;
    }

    function __getReserve() internal view override returns (uint256) {
        return reserveMock;
    }

    function __getTotalAssetValue() internal view override returns (uint256) {
        return totalAssetValueMock;
    }
}
