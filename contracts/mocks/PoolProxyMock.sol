// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {Implementation} from "../Implementation.sol";

contract PoolProxyMock is Implementation {
    constructor(IDSProxyRegistry dsProxyRegistry_)
        Implementation(dsProxyRegistry_)
    {}

    function getLevel() external pure returns (uint256) {
        return 1;
    }

    function canContractCall(address to, bytes4 sig)
        external
        pure
        returns (bool)
    {
        if (
            to == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) &&
            sig == 0x11111111
        ) {
            return false;
        }
        return true;
    }

    function canDelegateCall(address to, bytes4 sig)
        external
        pure
        returns (bool)
    {
        if (
            to == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) &&
            sig == 0x11111111
        ) {
            return false;
        }
        return true;
    }

    function execute(address _target, bytes calldata _data)
        external
        payable
        onlyOwner
        returns (bytes memory)
    {
        return vault.execute{value: msg.value}(_target, _data);
    }
}
