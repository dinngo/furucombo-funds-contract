// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {Implementation} from "../Implementation.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";

contract PoolProxyMock is Implementation {
    constructor(IDSProxyRegistry dsProxyRegistry_)
        Implementation(dsProxyRegistry_)
    {}

    function executeMock(address _target, bytes calldata _data)
        external
        payable
        onlyOwner
        returns (bytes memory)
    {
        return vault.execute{value: msg.value}(_target, _data);
    }

    function setLevel(uint256 level_) external {
        _setLevel(level_);
    }

    function setVault() external {
        _setVault(dsProxyRegistry);
    }

    function setComptroller(IComptroller comptroller_) external {
        _setComptroller(comptroller_);
    }

    function setupDenomination(IERC20 denomination_) external {
        _setDenomination(denomination_);
    }
}
