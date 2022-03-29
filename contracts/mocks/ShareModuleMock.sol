// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {ShareModule} from "../modules/ShareModule.sol";
import {BaseMock} from "./BaseMock.sol";

contract ShareModuleMock is ShareModule, BaseMock {
    uint256 public reserveMock;
    uint256 public grossAssetValueMock;
    uint256 public pendingRedemptionPenaltyMock;
    bool public grossAssetValueMocked;

    event BeforePurchaseCalled();
    event AfterPurchaseCalled();
    event BeforeRedeemCalled();
    event AfterRedeemCalled();

    constructor(IDSProxyRegistry dsProxyRegistry_) BaseMock(dsProxyRegistry_) {}

    function setReserve(uint256 amount) external {
        reserveMock = amount;
    }

    function setGrossAssetValue(uint256 amount) external {
        grossAssetValueMock = amount;
        grossAssetValueMocked = true;
    }

    function settlePendingRedemption() external {
        _settlePendingRedemption(true);
    }

    function setPendingRedemptionPenalty(uint256 penalty) external {
        pendingRedemptionPenaltyMock = penalty;
    }

    function settlePendingRedemptionWithoutPenalty() external {
        _settlePendingRedemption(false);
    }

    function setPendingUserPendingInfo(
        address user,
        uint256 round,
        uint256 share
    ) external {
        pendingUsers[user].pendingRound = round;
        pendingUsers[user].pendingShares = share;
    }

    function _callBeforePurchase(uint256) internal override returns (uint256) {
        emit BeforePurchaseCalled();
        return grossAssetValueMock;
    }

    function _callAfterPurchase(uint256, uint256) internal override {
        emit AfterPurchaseCalled();
    }

    function _callBeforeRedeem(uint256) internal override returns (uint256) {
        emit BeforeRedeemCalled();
        return grossAssetValueMock;
    }

    function _callAfterRedeem(uint256, uint256) internal override {
        emit AfterRedeemCalled();
    }

    function _getPendingRedemptionPenalty() internal view override returns (uint256) {
        return pendingRedemptionPenaltyMock;
    }

    function __getReserve() internal view override returns (uint256) {
        return reserveMock;
    }

    function __getGrossAssetValue() internal view override returns (uint256) {
        return grossAssetValueMock;
    }
}
