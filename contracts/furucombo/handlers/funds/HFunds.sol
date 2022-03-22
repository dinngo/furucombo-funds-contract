// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HandlerBase} from "../HandlerBase.sol";

contract HFunds is HandlerBase {
    using SafeERC20 for IERC20;

    function getContractName() public pure override returns (string memory) {
        return "HFunds";
    }

    function updateTokens(address[] calldata tokens)
        external
        payable
        returns (uint256[] memory)
    {
        uint256[] memory balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            _notMaticToken(token);
            // Update involved token
            _updateInitialToken(token);
            balances[i] = _getBalance(token, type(uint256).max);
        }
        return balances;
    }

    function inject(address[] calldata tokens, uint256[] calldata amounts)
        external
        payable
        returns (uint256[] memory)
    {
        _requireMsg(
            tokens.length == amounts.length,
            "inject",
            "token and amount does not match"
        );
        address sender = _getSender();
        for (uint256 i = 0; i < tokens.length; i++) {
            _notMaticToken(tokens[i]);
            IERC20(tokens[i]).safeTransferFrom(
                sender,
                address(this),
                amounts[i]
            );

            // Update involved token
            _updateInitialToken(tokens[i]);
        }
        return amounts;
    }

    function returnFunds(address[] calldata tokens, uint256[] calldata amounts)
        external
        payable
    {
        _requireMsg(
            tokens.length == amounts.length,
            "returnFunds",
            "token and amount do not match"
        );

        address payable receiver = payable(_getSender());
        for (uint256 i = 0; i < tokens.length; i++) {
            // token can't be matic token
            _notMaticToken(tokens[i]);

            uint256 amount = _getBalance(tokens[i], amounts[i]);
            if (amount > 0) {
                IERC20(tokens[i]).safeTransfer(receiver, amount);
            }
        }
    }

    function checkSlippage(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external payable {
        _requireMsg(
            tokens.length == amounts.length,
            "checkSlippage",
            "token and amount do not match"
        );

        for (uint256 i = 0; i < tokens.length; i++) {
            // token can't be matic token
            _notMaticToken(tokens[i]);

            uint256 balance = IERC20(tokens[i]).balanceOf(address(this));
            if (balance < amounts[i]) {
                string memory errMsg = string(
                    abi.encodePacked("error: ", _uint2String(i), "_", _uint2String(balance))
                );
                _revertMsg("checkSlippage", errMsg);
            }
        }
    }

    function getBalance(address token) external payable returns (uint256) {
        return _getBalance(token, type(uint256).max);
    }
}
