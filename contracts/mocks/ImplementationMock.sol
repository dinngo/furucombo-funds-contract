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

    function setComptroller(IComptroller comptroller_) external {
        _setComptroller(comptroller_);
    }

    function setDenomination(IERC20 denomination_) external {
        _setDenomination(denomination_);
    }

    function setDSProxy() external {
        address dsProxy_ = dsProxyRegistry.build();
        _setDSProxy(IDSProxy(dsProxy_));
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
}

contract CallActionMock {
    function call(address _target, bytes calldata _data)
        external
        returns (bool success)
    {
        (success, ) = _target.call(_data);
    }
}
