// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ModuleBase} from "./ModuleBase.sol";

contract ExecutionModule is ModuleBase {
    function beforeExecute() public virtual returns (bool) {
        return true;
    }

    function afterExecute() public virtual returns (bool) {
        return true;
    }

    function execute(bytes calldata data)
        external
        onlyOwner
        whenStates(State.Executing, State.WithdrawalPending)
    {
        beforeExecute();

        address action = comptroller.getAction();
        vault.execute(action, data);

        afterExecute();
    }
}
