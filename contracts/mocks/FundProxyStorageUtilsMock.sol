// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";
import {ISetupAction} from "../interfaces/ISetupAction.sol";

contract FundProxyStorageUtilsMock is FundProxyStorageUtils {
    function setLevel(uint256 level_) external {
        _setLevel(level_);
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

    function setReserveExecutionRate(uint256 reserveExecutionRate_) external {
        _setReserveExecutionRate(reserveExecutionRate_);
    }
}
