// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Errors} from "./utils/Errors.sol";
import {FundProxyStorage} from "./FundProxyStorage.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {ISetupAction} from "./interfaces/ISetupAction.sol";

abstract contract FundProxyStorageUtils is FundProxyStorage {
    uint256 internal constant _PENALTY_BASE = 1e4;
    uint256 internal constant _FEE_BASE = 1e4;

    event StateTransited(State to);

    error InvalidState(State current);

    modifier whenState(State expect) {
        if (state != expect) revert InvalidState(state);
        _;
    }

    modifier whenStates(State expect1, State expect2) {
        if (state != expect1 && state != expect2) revert InvalidState(state);
        _;
    }

    modifier when3States(
        State expect1,
        State expect2,
        State expect3
    ) {
        if (state != expect1 && state != expect2 && state != expect3) revert InvalidState(state);
        _;
    }

    modifier whenNotState(State expectNot) {
        if (state == expectNot) revert InvalidState(state);
        _;
    }

    // State Changes
    function _review() internal whenState(State.Initializing) {
        _enterState(State.Reviewing);
    }

    function _finalize() internal whenState(State.Reviewing) {
        _enterState(State.Executing);
    }

    function _pend() internal whenState(State.Executing) {
        _enterState(State.RedemptionPending);
        pendingStartTime = block.timestamp;
    }

    function _resume() internal whenState(State.RedemptionPending) {
        pendingStartTime = 0;
        _enterState(State.Executing);
    }

    function _liquidate() internal whenState(State.RedemptionPending) {
        pendingStartTime = 0;
        _enterState(State.Liquidating);
    }

    function _close() internal whenStates(State.Executing, State.Liquidating) {
        _enterState(State.Closed);
    }

    function _enterState(State state_) internal {
        state = state_;
        emit StateTransited(state_);
    }

    // Setters
    function _setLevel(uint256 level_) internal {
        Errors._require(level == 0, Errors.Code.FUND_PROXY_STORAGE_UTILS_LEVEL_IS_SET);
        Errors._require(level_ > 0, Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_LEVEL);
        level = level_;
    }

    function _setComptroller(IComptroller comptroller_) internal {
        Errors._require(
            address(comptroller) == address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_COMPTROLLER_IS_INITIALIZED
        );
        Errors._require(
            address(comptroller_) != address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_COMPTROLLER_ADDRESS
        );
        comptroller = comptroller_;
    }

    function _setDenomination(IERC20 denomination_) internal {
        Errors._require(
            comptroller.isValidDenomination(address(denomination_)),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_INVALID_DENOMINATION
        );
        denomination = denomination_;
    }

    function _setShareToken(IShareToken shareToken_) internal {
        Errors._require(
            address(shareToken) == address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_SHARE_TOKEN_IS_INITIALIZED
        );
        Errors._require(
            address(shareToken_) != address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_SHARE_TOKEN_ADDRESS
        );
        shareToken = shareToken_;
    }

    function _setMortgageVault(IComptroller comptroller_) internal {
        Errors._require(
            address(mortgageVault) == address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_MORTGAGE_VAULT_IS_INITIALIZED
        );
        Errors._require(
            address(comptroller_) != address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_COMPTROLLER_ADDRESS
        );

        mortgageVault = comptroller_.mortgageVault();
        Errors._require(
            address(mortgageVault) != address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_MORTGAGE_VAULT_IS_NOT_INITIALIZED
        );
    }

    function _setVault(IDSProxyRegistry dsProxyRegistry) internal {
        Errors._require(address(vault) == address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_VAULT_IS_INITIALIZED);

        Errors._require(address(dsProxyRegistry) != address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_REGISTRY);

        // deploy vault
        vault = IDSProxy(dsProxyRegistry.build());
        Errors._require(address(vault) != address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_VAULT_IS_NOT_INITIALIZED);
    }

    function _setVaultApproval(ISetupAction setupAction) internal {
        Errors._require(address(vault) != address(0), Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_VAULT);
        Errors._require(
            address(setupAction) != address(0),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_ZERO_SETUP_ACTION_ADDRESS
        );
        Errors._require(
            comptroller.isValidDenomination(address(denomination)),
            Errors.Code.FUND_PROXY_STORAGE_UTILS_INVALID_DENOMINATION
        );

        // set vault approval
        bytes memory data = abi.encodeWithSignature("maxApprove(address)", denomination);
        vault.execute(address(setupAction), data);

        Errors._require(
            denomination.allowance(address(vault), address(this)) == type(uint256).max,
            Errors.Code.FUND_PROXY_STORAGE_UTILS_WRONG_ALLOWANCE
        );
    }

    function _setReserveExecutionRate(uint256 reserveExecutionRate_) internal {
        Errors._require(
            reserveExecutionRate_ < _FEE_BASE,
            Errors.Code.FUND_PROXY_STORAGE_UTILS_INVALID_RESERVE_EXECUTION_RATE
        );
        reserveExecutionRate = reserveExecutionRate_;
    }
}
