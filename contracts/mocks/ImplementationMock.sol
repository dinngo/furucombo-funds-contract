// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {Implementation} from "../Implementation.sol";

contract ImplementationMock is Implementation {
    constructor(IDSProxyRegistry dsProxyRegistry_)
        Implementation(dsProxyRegistry_)
    {}

    function reviewingMock() external {
        _enterState(State.Reviewing);
    }

    function pendMock() external {
        _pend();
    }

    /////////////////////////////////////////////////////
    // General
    /////////////////////////////////////////////////////
    function getTotalAssetValue() external view returns (uint256) {
        return __getTotalAssetValue();
    }

    /////////////////////////////////////////////////////
    // Execution module
    /////////////////////////////////////////////////////
    function vaultCallMock(address _target, bytes calldata _data)
        external
        returns (bytes memory)
    {
        bytes memory data = abi.encodeWithSignature(
            "call(address,bytes)",
            _target,
            _data
        );
        CallActionMock action = new CallActionMock();

        return vault.execute(address(action), data);
    }

    function isReserveEnough() external view returns (bool) {
        return _isReserveEnough();
    }
}

contract CallActionMock {
    function call(address _target, bytes calldata _data)
        external
        returns (bool success)
    {
        (success, ) = _target.call(_data);
    }
}
