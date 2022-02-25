// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {Implementation} from "../Implementation.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";

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

    function setVault() external {
        _setVault(dsProxyRegistry, setupAction);
    }

    function setComptroller(IComptroller comptroller_) external {
        _setComptroller(comptroller_);
    }

    function setupDenomination(IERC20 denomination_) external {
        _setDenomination(denomination_);
    }
}
