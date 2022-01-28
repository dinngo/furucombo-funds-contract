// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {Implementation} from "../Implementation.sol";

contract PoolProxyMock is Implementation {
    constructor(IDSProxyRegistry dsProxyRegistry_)
        Implementation(dsProxyRegistry_)
    {}

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

    function executeMock(address _target, bytes calldata _data)
        external
        payable
        onlyOwner
        returns (bytes memory)
    {
        return vault.execute{value: msg.value}(_target, _data);
    }

    function setLevel(uint256 level) external {
        _setLevel(level);
    }

    function setDSProxy() external {
        address dsProxy = dsProxyRegistry.build();
        _setDSProxy(IDSProxy(dsProxy));
    }
}
