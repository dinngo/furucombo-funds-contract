// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {DestructibleAction} from "../../utils/DestructibleAction.sol";
import {DelegateCallAction} from "../../utils/DelegateCallAction.sol";
import {Errors} from "../../utils/Errors.sol";
import {IFund} from "../../interfaces/IFund.sol";
import {ActionBase} from "../ActionBase.sol";
import {IComptroller} from "../../interfaces/IComptroller.sol";
import {IDebtToken} from "../../interfaces/IDebtToken.sol";
import {IFurucombo} from "./IFurucombo.sol";

/// @title The action of Furucombo
contract AFurucombo is ActionBase, DestructibleAction, DelegateCallAction {
    using SafeERC20 for IERC20;

    address payable public immutable proxy;
    IComptroller public immutable comptroller;
    uint256 private constant _TOKEN_DUST = 10;

    constructor(
        address payable owner_,
        address payable proxy_,
        address comptroller_
    ) DestructibleAction(owner_) DelegateCallAction() {
        proxy = proxy_;
        comptroller = IComptroller(comptroller_);
    }

    /// @notice Inject tokens and execute combo.
    /// @param tokensIn_ The input tokens.
    /// @param amountsIn_ The input token amounts.
    /// @param tokensOut_ The sorted output tokens
    /// @param tos_ The handlers of combo.
    /// @param configs_ The configurations of executing cubes.
    /// @param datas_ The combo datas.
    /// @return The output token amounts.
    function injectAndBatchExec(
        address[] calldata tokensIn_,
        uint256[] calldata amountsIn_,
        address[] calldata tokensOut_,
        address[] calldata tos_,
        bytes32[] calldata configs_,
        bytes[] memory datas_
    ) external payable delegateCallOnly returns (uint256[] memory) {
        // check comptroller handler call
        _checkHandlerCall(tos_, datas_);

        // Inject and execute combo
        _inject(tokensIn_, amountsIn_);

        // Snapshot output token amounts after send token to Furucombo proxy
        uint256[] memory amountsOut = new uint256[](tokensOut_.length);
        for (uint256 i = 0; i < tokensOut_.length; i++) {
            // Check duplicate tokens out
            if (i > 0) {
                Errors._require(tokensOut_[i] > tokensOut_[i - 1], Errors.Code.AFURUCOMBO_DUPLICATED_TOKENSOUT);
            }

            // Get balance before execution
            amountsOut[i] = _getBalance(tokensOut_[i]);
        }

        // Execute furucombo proxy batchExec
        try IFurucombo(proxy).batchExec(tos_, configs_, datas_) returns (address[] memory dealingAssets) {
            for (uint256 i = 0; i < dealingAssets.length; i++) {
                // Update dealing asset
                _addDealingAsset(dealingAssets[i]);
            }
        } catch Error(string memory reason) {
            Errors._revertMsg("injectAndBatchExec", reason);
        } catch {
            Errors._revertMsg("injectAndBatchExec");
        }

        // Check no remaining input tokens to ensure updateTokens was called
        for (uint256 i = 0; i < tokensIn_.length; i++) {
            Errors._require(
                IERC20(tokensIn_[i]).balanceOf(proxy) < _TOKEN_DUST,
                Errors.Code.AFURUCOMBO_REMAINING_TOKENS
            );
        }

        // Calculate increased output token amounts
        for (uint256 i = 0; i < tokensOut_.length; i++) {
            amountsOut[i] = _getBalance(tokensOut_[i]) - amountsOut[i];

            // Update asset quota
            _increaseAssetQuota(tokensOut_[i], amountsOut[i]);
        }

        return amountsOut;
    }

    function approveDelegation(IDebtToken[] calldata tokens, uint256[] calldata amounts)
        external
        payable
        delegateCallOnly
    {
        Errors._require(tokens.length == amounts.length, Errors.Code.AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT);

        // approve delegation to furucombo proxy only,
        // otherwise manager can borrow tokens base on the collateral of funds
        for (uint256 i = 0; i < tokens.length; i++) {
            try tokens[i].approveDelegation(proxy, amounts[i]) {
                // Update dealing asset
                _addDealingAsset(address(tokens[i]));
            } catch Error(string memory reason) {
                Errors._revertMsg("approveDelegation", reason);
            } catch {
                Errors._revertMsg("approveDelegation");
            }
        }
    }

    function approveToken(address[] calldata tokens, uint256[] calldata amounts) external payable delegateCallOnly {
        Errors._require(tokens.length == amounts.length, Errors.Code.AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT);

        // approve token to furucombo proxy only,
        // otherwise manager can approve tokens to other address
        for (uint256 i = 0; i < tokens.length; i++) {
            _tokenApprove(tokens[i], proxy, amounts[i]);
            _addDealingAsset(tokens[i]);
        }
    }

    /// @notice verify valid handler .
    function _checkHandlerCall(address[] memory tos_, bytes[] memory datas_) internal {
        // check comptroller handler call
        uint256 level = IFund(msg.sender).level();
        for (uint256 i = 0; i < tos_.length; ++i) {
            Errors._require(
                comptroller.canHandlerCall(level, tos_[i], bytes4(datas_[i])),
                Errors.Code.AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL
            );
        }
    }

    /// @notice Inject tokens to furucombo.
    function _inject(address[] memory tokensIn_, uint256[] memory amountsIn_) internal {
        Errors._require(
            tokensIn_.length == amountsIn_.length,
            Errors.Code.AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
        );

        for (uint256 i = 0; i < tokensIn_.length; i++) {
            uint256 amount = amountsIn_[i];

            if (amount > 0) {
                // decrease asset quota
                _decreaseAssetQuota(tokensIn_[i], amount);
                IERC20(tokensIn_[i]).safeTransfer(proxy, amount);
            }
        }
    }
}
