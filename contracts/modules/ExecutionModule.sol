// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {PoolState} from "../PoolState.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

contract ExecutionModule is PoolState {
    using Whitelist for Whitelist.ActionWList;

    Whitelist.ActionWList private _actionWList;

    function _beforeExecute() internal virtual returns (bool) {
        return true;
    }

    function _afterExecute() internal virtual returns (bool) {
        return true;
    }

    function execute(bytes calldata data)
        public
        virtual
        whenStates(State.Executing, State.RedemptionPending)
    {
        _beforeExecute();

        address action = comptroller.getAction();
        vault.execute(action, data);

        _afterExecute();
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

    function _isValidAction(address to, bytes4 sig)
        internal
        view
        returns (bool)
    {
        return
            _actionWList.canCall(0, address(0), bytes4(0)) ||
            _actionWList.canCall(0, to, sig);
    }
}
