// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";

abstract contract PoolState {
    enum State {
        Initializing,
        Ready,
        Executing,
        RedemptionPending,
        Liquidating,
        Closed
    }

    uint256 public level;
    State public state;
    IComptroller public comptroller;
    IERC20 public denomination;
    IShareToken public shareToken;
    IDSProxy public vault; // DSProxy
    uint256 public reserveExecution;

    error InvalidState(State current);

    modifier whenState(State expect) {
        if (state != expect) revert InvalidState(state);
        _;
    }

    modifier whenStates(State expect1, State expect2) {
        if (state != expect1 && state != expect2) revert InvalidState(state);
        _;
    }

    modifier whenNotState(State expectNot) {
        if (state == expectNot) revert InvalidState(state);
        _;
    }

    modifier checkReady() {
        _;
        if (
            state == State.Initializing &&
            address(comptroller) != address(0) &&
            address(denomination) != address(0) &&
            address(shareToken) != address(0) &&
            address(vault) != address(0)
        ) _enterState(State.Ready);
    }

    function _finalize() internal whenState(State.Ready) {
        _enterState(State.Executing);
    }

    function _liquidate() internal whenState(State.RedemptionPending) {
        _enterState(State.Liquidating);
        // Transfer the ownership to proceed liquidation
    }

    function _close() internal whenStates(State.Executing, State.Liquidating) {
        _enterState(State.Closed);
    }

    function _enterState(State state_) internal {
        state = state_;
    }

    function _setLevel(uint256 level_) internal {
        require(level == 0, "Level is set");
        level = level_;
    }

    function _setComptroller(IComptroller comptroller_) internal {
        require(
            address(comptroller) == address(0),
            "Comptroller is initialized"
        );
        comptroller = comptroller_;
    }

    function _setDenomination(IERC20 denomination_) internal {
        require(
            address(denomination) == address(0),
            "Denomination is initialized"
        );
        denomination = denomination_;
    }

    function _setShare(IShareToken shareToken_) internal {
        require(address(shareToken) == address(0), "Share is initialized");
        shareToken = shareToken_;
    }

    function _setDSProxy(IDSProxy dsProxy) internal {
        require(address(vault) == address(0), "Share is initialized");
        vault = dsProxy;
    }

    function _setReserveExecution(uint256 reserveExecution_)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        reserveExecution = reserveExecution_;
    }
}
