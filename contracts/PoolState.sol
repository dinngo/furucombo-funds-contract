// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy} from "./interfaces/IDSProxy.sol";
import {IShareERC20} from "./interfaces/IShareERC20.sol";
import {Whitelist} from "./libraries/Whitelist.sol";

abstract contract PoolState {
    using Whitelist for Whitelist.ActionWList;
    using Whitelist for Whitelist.AssetWList;

    enum State {
        Initializing,
        Ready,
        Executing,
        WithdrawalPending,
        Liquidating,
        Closed
    }

    State public state;
    IComptroller public comptroller;
    IERC20 public denomination;
    IShareERC20 public shareToken;
    IDSProxy public vault; // DSProxy
    uint256 public pendingStartTime;
    uint256 public reserveExecution;
    Whitelist.ActionWList private _actionWList;
    Whitelist.AssetWList private _assetWList;

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

    function finalize() public whenState(State.Ready) {
        _enterState(State.Executing);
    }

    function liquidate() public whenState(State.WithdrawalPending) {
        _enterState(State.Liquidating);
        // Transfer the ownership to proceed liquidation
    }

    function _enterState(State state_) internal {
        state = state_;
    }

    function _setComptroller(IComptroller comptroller_) internal checkReady {
        require(
            address(comptroller) == address(0),
            "Comptroller is initialized"
        );
        comptroller = comptroller_;
    }

    function _setDenomination(IERC20 denomination_) internal checkReady {
        require(
            address(denomination) == address(0),
            "Denomination is initialized"
        );
        denomination = denomination_;
    }

    function _setShare(IShareERC20 shareToken_) internal checkReady {
        require(address(shareToken) == address(0), "Share is initialized");
        shareToken = shareToken_;
    }

    function _setDSProxy(IDSProxy dsProxy) internal checkReady {
        require(address(vault) == address(0), "Share is initialized");
        vault = dsProxy;
    }

    function _setReserveExecution(uint256 reserveExecution_)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        reserveExecution = reserveExecution_;
    }

    function _permitAction(address to, bytes4 sig)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _actionWList.permit(0, to, sig);
    }

    function _isValidAction(address to, bytes4 sig)
        internal
        view
        returns (bool)
    {
        return _actionWList.canCall(0, to, sig);
    }

    function _permitAsset(address asset)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _assetWList.permit(0, asset);
    }

    function _isValidAsset(address asset) internal view returns (bool) {
        return _assetWList.canCall(0, asset);
    }
}
