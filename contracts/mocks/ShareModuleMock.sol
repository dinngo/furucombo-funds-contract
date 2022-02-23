// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {ShareModule} from "../modules/ShareModule.sol";
import {BaseMock} from "./BaseMock.sol";

contract ShareModuleMock is ShareModule, BaseMock {
    uint256 public reserveMock;
    uint256 public totalAssetValueMock;

    event BeforePurchaseCalled();
    event AfterPurchaseCalled();
    event BeforeRedeemCalled();
    event AfterRedeemCalled();

    constructor(IDSProxyRegistry dsProxyRegistry_) BaseMock(dsProxyRegistry_) {}

    function setReserve(uint256 amount) external {
        reserveMock = amount;
    }

    function setTotalAssetValue(uint256 amount) external {
        totalAssetValueMock = amount;
    }

    function settlePendingRedemption() external {
        _settlePendingRedemption(true);
    }

    function settlePendingRedemptionWithoutPenalty() external {
        _settlePendingRedemption(false);
    }

    function _callBeforePurchase(uint256) internal override {
        emit BeforePurchaseCalled();
    }

    function _callAfterPurchase(uint256) internal override {
        emit AfterPurchaseCalled();
    }

    function _callBeforeRedeem(uint256) internal override {
        emit BeforeRedeemCalled();
    }

    function _callAfterRedeem(uint256) internal override {
        emit AfterRedeemCalled();
    }

    function __getReserve() internal view override returns (uint256) {
        return reserveMock;
    }

    function __getTotalAssetValue() internal view override returns (uint256) {
        return totalAssetValueMock;
    }
}
