// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PoolState} from "../PoolState.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

/// @title Execution module
abstract contract ExecutionModule is PoolState {
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

        // TODO: add value?
        vault.execute(action, data);

        _afterExecute();
    }

    function _beforeExecute() internal virtual returns (bool) {
        return true;
    }

    function _afterExecute() internal virtual returns (bool) {
        return true;
    }
}
