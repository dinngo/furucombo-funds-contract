// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "./utils/Errors.sol";
import {FundProxyStorage} from "./FundProxyStorage.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {ISetupAction} from "./interfaces/ISetupAction.sol";

/// @title Furucombo fund proxy storage utility
abstract contract FundProxyStorageUtils is FundProxyStorage {
    uint256 internal constant _FUND_PERCENTAGE_BASE = 1e4;

    event StateTransited(State to);

    error InvalidState(State current);

    /// @dev Prevents functions from being called outside of this state.
    modifier whenState(State expect_) {
        _whenState(expect_);
        _;
    }

    /// @dev Prevents functions from being called outside of this two state.
    modifier whenStates(State expect1_, State expect2_) {
        _whenStates(expect1_, expect2_);
        _;
    }

    /// @dev Prevents functions from being called outside of this three state.
    modifier when3States(
        State expect1_,
        State expect2_,
        State expect3_
    ) {
        _when3States(expect1_, expect2_, expect3_);
        _;
    }

    /// @dev Prevent the function from being called in this state.
    modifier whenNotState(State expectNot_) {
        _whenNotState(expectNot_);
        _;
    }

    /// @dev Prevents functions from being called outside of this state.
    function _whenState(State expect_) internal view {
        if (state != expect_) revert InvalidState(state);
    }

    /// @dev Prevents functions from being called outside of this two state.
    function _whenStates(State expect1_, State expect2_) internal view {
        State s = state;
        if (s != expect1_ && s != expect2_) revert InvalidState(s);
    }

    /// @dev Prevents functions from being called outside of this three state.
    function _when3States(
        State expect1_,
        State expect2_,
        State expect3_
    ) internal view {
        State s = state;
        if (s != expect1_ && s != expect2_ && s != expect3_) revert InvalidState(s);
    }

    /// @dev Prevent the function from being called in this state.
    function _whenNotState(State expectNot_) internal view {
        if (state == expectNot_) revert InvalidState(state);
    }

    /// @dev Trigger initializing to reviewing state change.
    function _review() internal whenState(State.Initializing) {
        _enterState(State.Reviewing);
    }

    /// @dev Trigger reviewing to executing state change.
    function _finalize() internal whenState(State.Reviewing) {
        _enterState(State.Executing);
    }

    /// @dev Trigger executing to pending state change.
    function _pend() internal whenState(State.Executing) {
        _enterState(State.Pending);
        pendingStartTime = block.timestamp;
    }

    /// @dev Trigger pending to executing state change.
    function _resume() internal whenState(State.Pending) {
        pendingStartTime = 0;
        _enterState(State.Executing);
    }

    /// @dev Trigger pending to liquidating state change.
    function _liquidate() internal whenState(State.Pending) {
        pendingStartTime = 0;
        _enterState(State.Liquidating);
    }

    /// @dev Trigger executing and liquidating to closed state change.
    function _close() internal whenStates(State.Executing, State.Liquidating) {
        _enterState(State.Closed);
    }

    /// @dev Update the fund state and emit state transited event.
    function _enterState(State state_) internal {
        state = state_;
        emit StateTransited(state_);
    }

    /////////////////////////////////////////////////////
    // Setters
    /////////////////////////////////////////////////////
    /// @notice Set the tier of the fund.
    function _setLevel(uint256 level_) internal {
        _checkZero(level);
        _checkNotZero(level_);
        level = level_;
    }

    /// @notice Set the comptroller of the fund.
    function _setComptroller(IComptroller comptroller_) internal {
        _checkZero(address(comptroller));
        _checkNotZero(address(comptroller_));
        comptroller = comptroller_;
    }

    /// @notice Set the denomination of the fund.
    function _setDenomination(IERC20 denomination_) internal {
        _checkZero(address(denomination));
        Errors._require(
            comptroller.isValidDenomination(address(denomination_)),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_INVALID_DENOMINATION
        );
        denomination = denomination_;
    }

    /// @notice Set the share token of the fund.
    function _setShareToken(IShareToken shareToken_) internal {
        _checkZero(address(shareToken));
        _checkNotZero(address(shareToken_));
        shareToken = shareToken_;
    }

    /// @notice Set the mortgage vault of the fund.
    function _setMortgageVault(IComptroller comptroller_) internal {
        _checkZero(address(mortgageVault));
        mortgageVault = comptroller_.mortgageVault();
    }

    /// @notice Set the asset vault of the fund.
    function _setVault(IDSProxyRegistry dsProxyRegistry_) internal {
        _checkZero(address(vault));
        _checkNotZero(address(dsProxyRegistry_));

        // check if vault proxy exists
        IDSProxy vaultProxy = IDSProxy(dsProxyRegistry_.proxies(address(this)));
        if (address(vaultProxy) != address(0)) {
            Errors._require(vaultProxy.owner() == address(this), Errors.Code.FUND_PROXY_STORAGE_UTILS_UNKNOWN_OWNER);
            vault = vaultProxy;
        } else {
            // deploy vault
            vault = IDSProxy(dsProxyRegistry_.build());
            _checkNotZero(address(vault));
        }
    }

    /// @notice Set the vault approveal.
    function _setVaultApproval(ISetupAction setupAction_) internal {
        _checkNotZero(address(vault));
        _checkNotZero(address(setupAction_));

        // set vault approval
        bytes memory data = abi.encodeWithSignature("maxApprove(address)", denomination);
        vault.execute(address(setupAction_), data);

        Errors._require(
            denomination.allowance(address(vault), address(this)) == type(uint256).max,
            Errors.Code.FUND_PROXY_STORAGE_UTILS_WRONG_ALLOWANCE
        );
    }

    /// @dev Check the uint256 is zero.
    function _checkZero(uint256 param_) private pure {
        Errors._require(param_ == 0, Errors.Code.FUND_PROXY_STORAGE_UTILS_IS_NOT_ZERO);
    }

    /// @dev Check the address is zero address.
    function _checkZero(address param_) private pure {
        Errors._require(param_ == address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_IS_NOT_ZERO);
    }

    /// @dev Check the uint256 is not zero.
    function _checkNotZero(uint256 param_) private pure {
        Errors._require(param_ > 0, Errors.Code.FUND_PROXY_STORAGE_UTILS_IS_ZERO);
    }

    /// @dev Check the address is not zero address.
    function _checkNotZero(address param_) private pure {
        Errors._require(param_ != address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_IS_ZERO);
    }
}
