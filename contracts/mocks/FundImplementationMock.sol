// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {FundImplementation} from "../FundImplementation.sol";

contract FundImplementationMock is FundImplementation {
    uint256 public totalAssetValueMock;
    bool public totalAssetValueMocked;
    uint256 public lastTotalAssetValue;

    constructor(IDSProxyRegistry dsProxyRegistry_)
        FundImplementation(dsProxyRegistry_)
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
    function setTotalAssetValueMock(uint256 totalAssetValue) external {
        totalAssetValueMock = totalAssetValue;
        totalAssetValueMocked = true;
    }

    function getTotalAssetValue()
        public
        view
        override(FundImplementation)
        returns (uint256)
    {
        if (totalAssetValueMocked) {
            return totalAssetValueMock;
        } else {
            return super.getTotalAssetValue();
        }
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

    function setLastTotalAssetValue(uint256 value) external {
        lastTotalAssetValue = value;
    }

    function _beforeExecute() internal view override returns (uint256) {
        return lastTotalAssetValue;
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
