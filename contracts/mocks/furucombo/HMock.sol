// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

interface IFaucet {
    function drain() external payable;

    function drainToken(address token_, uint256 amount_) external;
}

contract HMock is HandlerBase {
    using SafeERC20 for IERC20;

    function getContractName() public pure override returns (string memory) {
        return "HMock";
    }

    function drain(address target_, uint256 v_) external payable {
        IFaucet(target_).drain{value: v_}();
    }

    function drainToken(
        address target_,
        address token_,
        uint256 amount_
    ) external payable {
        IERC20(token_).safeApprove(target_, amount_);
        IFaucet(target_).drainToken(token_, amount_);
        IERC20(token_).safeApprove(target_, 0);
        _updateToken(token_);
    }

    function drainTokens(
        address[] calldata targets_,
        address[] calldata tokens_,
        uint256[] calldata amounts_
    ) external payable {
        for (uint256 i = 0; i < targets_.length; i++) {
            IERC20(tokens_[i]).safeApprove(targets_[i], amounts_[i]);
            IFaucet(targets_[i]).drainToken(tokens_[i], amounts_[i]);
            IERC20(tokens_[i]).safeApprove(targets_[i], 0);
            _updateToken(tokens_[i]);
        }
    }

    function sendTokens(
        address[] calldata targets,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external payable {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20(tokens[i]).transfer(targets[i], amounts[i]);
            _updateToken(tokens[i]);
        }
    }

    function doUpdateTokenOnly(address[] calldata tokens) external payable {
        for (uint256 i = 0; i < tokens.length; i++) {
            _updateToken(tokens[i]);
        }
    }
}
