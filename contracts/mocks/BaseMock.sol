// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";
import {PoolProxyStorageUtils} from "../PoolProxyStorageUtils.sol";
import {ShareToken} from "../ShareToken.sol";
import {SetupAction} from "../actions/SetupAction.sol";
import {ISetupAction} from "../interfaces/ISetupAction.sol";

contract BaseMock is PoolProxyStorageUtils {
    IDSProxyRegistry public immutable dsProxyRegistry;
    ISetupAction public immutable setupAction;

    constructor(IDSProxyRegistry dsProxyRegistry_) {
        dsProxyRegistry = dsProxyRegistry_;
        setupAction = new SetupAction();
    }

    function setLevel(uint256 level_) external {
        _setLevel(level_);
    }

    function setState(State state_) external {
        _enterState(state_);
    }

    function setComptroller(IComptroller comptroller_) external {
        _setComptroller(comptroller_);
    }

    function setDenomination(IERC20 denomination_) external {
        _setDenomination(denomination_);
    }

    function setShare() external returns (address) {
        ShareToken token = new ShareToken("TST", "Test share", 18);
        _setShareToken(IShareToken(address(token)));
        return address(token);
    }

    function setVault() external {
        _setVault(dsProxyRegistry);
    }

    function setVaultApproval() external {
        _setVaultApproval(setupAction);
    }

    function setReserveExecutionRate(uint256 reserve_) external {
        _setReserveExecutionRate(reserve_);
    }
}
