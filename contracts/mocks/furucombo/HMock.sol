// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HandlerBase} from "../../furucombo/handlers/HandlerBase.sol";

interface IFaucet {
    function drain() external payable;

    function drainToken(address token, uint256 amount) external;
}

contract HMock is HandlerBase {
    using SafeERC20 for IERC20;

    function getContractName() public pure override returns (string memory) {
        return "HMock";
    }

    function drain(address target, uint256 v) external payable {
        IFaucet(target).drain{value: v}();
    }

    function drainToken(
        address target,
        address token,
        uint256 amount
    ) external payable {
        IERC20(token).safeApprove(target, amount);
        IFaucet(target).drainToken(token, amount);
        IERC20(token).safeApprove(target, 0);
        _updateToken(token);
    }

    function drainTokens(
        address[] calldata targets,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external payable {
        for (uint256 i = 0; i < targets.length; i++) {
            IERC20(tokens[i]).safeApprove(targets[i], amounts[i]);
            IFaucet(targets[i]).drainToken(tokens[i], amounts[i]);
            IERC20(tokens[i]).safeApprove(targets[i], 0);
            _updateToken(tokens[i]);
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
