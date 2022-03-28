// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

/// @title Execution module
abstract contract ExecutionModule is FundProxyStorageUtils {
    event Executed();

    /// @notice Execute on the fund's behalf. Execution is valid during
    /// Executing and Redemption Pending state.
    /// @param data The data to be applied to the execution.
    function execute(bytes calldata data)
        public
        virtual
        when3States(State.Executing, State.RedemptionPending, State.Liquidating)
    {
        uint256 lastAmount = _beforeExecute();

        address action = comptroller.execAction();
        bytes memory response = vault.execute(action, data);

        _afterExecute(response, lastAmount);

        emit Executed();
    }

    function _beforeExecute() internal virtual returns (uint256) {
        return 0;
    }

    function _afterExecute(bytes memory, uint256) internal virtual returns (uint256) {
        return 0;
    }
}
