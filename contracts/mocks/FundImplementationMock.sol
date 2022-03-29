// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {FundImplementation} from "../FundImplementation.sol";

contract FundImplementationMock is FundImplementation {
    bool public grossAssetValueMocked;
    uint256 public grossAssetValueMock;
    uint256 public lastGrossAssetValue;

    constructor(IDSProxyRegistry dsProxyRegistry_) FundImplementation(dsProxyRegistry_) {}

    function reviewingMock() external {
        _enterState(State.Reviewing);
    }

    function pendMock() external {
        _pend();
    }

    /////////////////////////////////////////////////////
    // General
    /////////////////////////////////////////////////////
    function setGrossAssetValueMock(uint256 grossAssetValue_) external {
        grossAssetValueMock = grossAssetValue_;
        grossAssetValueMocked = true;
    }

    function getGrossAssetValue() public view override returns (uint256) {
        if (grossAssetValueMocked) {
            return grossAssetValueMock;
        } else {
            return super.getGrossAssetValue();
        }
    }

    /////////////////////////////////////////////////////
    // Execution module
    /////////////////////////////////////////////////////
    function vaultCallMock(address target_, bytes calldata data_) external returns (bytes memory) {
        bytes memory data = abi.encodeWithSignature("call(address,bytes)", target_, data_);
        CallActionMock action = new CallActionMock();

        return vault.execute(address(action), data);
    }

    function isReserveEnough() external view returns (bool) {
        uint256 value = getGrossAssetValue();
        return _isReserveEnough(value);
    }

    function setLastGrossAssetValue(uint256 value_) external {
        lastGrossAssetValue = value_;
    }

    function _beforeExecute() internal view override returns (uint256) {
        return lastGrossAssetValue;
    }
}

contract CallActionMock {
    function call(address target_, bytes calldata data_) external returns (bool success) {
        (success, ) = target_.call(data_);
    }
}
