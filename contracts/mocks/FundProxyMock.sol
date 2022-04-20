// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {FundImplementation} from "../FundImplementation.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";
import {ISetupAction} from "../interfaces/ISetupAction.sol";

contract FundProxyMock is FundImplementation {
    constructor(IDSProxyRegistry dsProxyRegistry_) FundImplementation(dsProxyRegistry_) {}

    function executeMock(address target_, bytes calldata data_) external payable onlyOwner returns (bytes memory) {
        return vault.execute{value: msg.value}(target_, data_);
    }

    function setLevel(uint256 level_) external {
        _setLevel(level_);
    }

    function setState(State state_) external {
        _enterState(state_);
    }

    function setVault(IDSProxyRegistry dsProxyRegistry_) external {
        _setVault(dsProxyRegistry_);
    }

    function setComptroller(IComptroller comptroller_) external {
        _setComptroller(comptroller_);
    }

    function setDenomination(IERC20 denomination_) external {
        _setDenomination(denomination_);
    }

    function setMortgageVault(IComptroller comptroller_) external {
        _setMortgageVault(comptroller_);
    }

    function setShareToken(IShareToken shareToken_) external {
        _setShareToken(shareToken_);
    }

    function setVaultApproval(ISetupAction setupAction_) external {
        _setVaultApproval(setupAction_);
    }
}
