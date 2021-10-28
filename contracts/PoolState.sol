// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy} from "./interfaces/IDSProxy.sol";
import {IShareERC20} from "./interfaces/IShareERC20.sol";

abstract contract PoolState {
    enum State {
        Initializing,
        Ready,
        Executing,
        WithdrawalPending,
        Liquidating,
        Closed
    }

    IComptroller public comptroller;
    IERC20 public denomination;
    IShareERC20 public shareToken;
    IDSProxy public vault; // DSProxy
    State public state;

    error InvalidState(State expect, State current);
    error InvalidStates(State expect1, State expect2, State current);

    modifier whenState(State expect) {
        if (state != expect) revert InvalidState(expect, state);
        _;
    }

    modifier whenStates(State expect1, State expect2) {
        if (state != expect1 && state != expect2)
            revert InvalidStates(expect1, expect2, state);
        _;
    }

    modifier checkReady() {
        _;
        if (
            address(comptroller) != address(0) &&
            address(denomination) != address(0) &&
            address(vault) != address(0)
        ) _enterState(State.Ready);
    }

    function setComptroller(IComptroller comptroller_)
        public
        whenState(State.Initializing)
    {
        comptroller = comptroller_;
    }

    function finalize() public whenState(State.Ready) {
        _enterState(State.Executing);
    }

    function _enterState(State state_) internal {
        state = state_;
    }
}
