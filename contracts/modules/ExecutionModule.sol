// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PoolProxyStorageUtils} from "../PoolProxyStorageUtils.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

/// @title Execution module
abstract contract ExecutionModule is PoolProxyStorageUtils {
    /// @notice Execute on the pool's behalf. Execution is valid during
    /// Executing and Redemption Pending state.
    /// @param data The data to be applied to the execution.
    function execute(bytes calldata data)
        public
        virtual
        when3States(State.Executing, State.RedemptionPending, State.Liquidating)
    {
        _beforeExecute();

        address action = comptroller.execAction();
        bytes memory response = vault.execute(action, data);

        _afterExecute(response);
    }

    function _beforeExecute() internal virtual returns (bool) {
        return true;
    }

    /// @param response execution response.
    function _afterExecute(bytes memory response)
        internal
        virtual
        returns (bool)
    {
        response;
        return true;
    }
}
