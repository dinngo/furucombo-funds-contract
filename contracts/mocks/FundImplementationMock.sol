// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
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

    function setState(State state_) external {
        _enterState(state_);
    }

    function resumeWithGrossAssetValue(uint256 grossAssetValue_) external {
        _resumeWithGrossAssetValue(grossAssetValue_);
    }
}

contract CallActionMock {
    function call(address target_, bytes calldata data_) external returns (bool success) {
        (success, ) = target_.call(data_);
    }
}
