// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PoolState} from "../PoolState.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

/// @title Execution module
abstract contract ExecutionModule is PoolState {
    using Whitelist for Whitelist.ActionWList;

    Whitelist.ActionWList private _actionWList;

    /// @notice Execute on the pool's behalf. Execution is valid during
    /// Executing and Redemption Pending state.
    /// @param data The data to be applied to the execution.
    function execute(bytes calldata data)
        public
        virtual
        whenStates(State.Executing, State.RedemptionPending)
    {
        _beforeExecute();

        address action = comptroller.execAction();
        vault.execute(action, data);

        _afterExecute();
    }

    /// @notice Permit an action that can be taken when execution.
    /// @param to The action contract to be permitted.
    /// @param sig The function signature to be permitted.
    function permitAction(address to, bytes4 sig) public virtual {
        _permitAction(to, sig);
    }

    /// @notice Forbid an action from being taken when execution.
    /// @param to The action contract to be forbidden.
    /// @param sig The function signature to be forbidden.
    function forbidAction(address to, bytes4 sig) public virtual {
        _forbidAction(to, sig);
    }

    /// @notice Permit all supported action when execution.
    function permitAllAction() public virtual {
        _permitAction(address(0), bytes4(0));
    }

    /// @notice Cancel the permission of all supported action.
    function cancelPermitAllAction() public virtual {
        _forbidAction(address(0), bytes4(0));
    }

    /// @notice Check if the action is valid.
    /// @param to The action contract to be queried.
    /// @param sig The function signature to be queried.
    function isValidAction(address to, bytes4 sig)
        public
        view
        virtual
        returns (bool)
    {
        return
            _actionWList.canCall(0, address(0), bytes4(0)) ||
            _actionWList.canCall(0, to, sig);
    }

    function _beforeExecute() internal virtual returns (bool) {
        return true;
    }

    function _afterExecute() internal virtual returns (bool) {
        return true;
    }

    function _permitAction(address to, bytes4 sig)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _actionWList.permit(0, to, sig);
    }

    function _forbidAction(address to, bytes4 sig)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _actionWList.forbid(0, to, sig);
    }
}
