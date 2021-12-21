// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

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

            if (token != address(0) && token != NATIVE_TOKEN_ADDRESS) {
                // Update involved token
                _updateInitialToken(token);
            }
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

    function sendTokens(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address payable receiver
    ) external payable {
        for (uint256 i = 0; i < tokens.length; i++) {
            // token can't be matic token
            _notMaticToken(tokens[i]);

            uint256 amount = _getBalance(tokens[i], amounts[i]);
            if (amount > 0) {
                // ETH case
                if (
                    tokens[i] == address(0) || tokens[i] == NATIVE_TOKEN_ADDRESS
                ) {
                    receiver.transfer(amount);
                } else {
                    IERC20(tokens[i]).safeTransfer(receiver, amount);
                }
            }
        }
    }

    function send(uint256 amount, address payable receiver) external payable {
        amount = _getBalance(address(0), amount);
        if (amount > 0) {
            receiver.transfer(amount);
        }
    }

    function sendToken(
        address token,
        uint256 amount,
        address receiver
    ) external payable {
        // token can't be matic token
        _notMaticToken(token);

        amount = _getBalance(token, amount);
        if (amount > 0) {
            IERC20(token).safeTransfer(receiver, amount);
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

            if (tokens[i] == address(0)) {
                if (address(this).balance < amounts[i]) {
                    string memory errMsg = string(
                        abi.encodePacked(
                            "error: ",
                            _uint2String(i),
                            "_",
                            _uint2String(address(this).balance)
                        )
                    );
                    _revertMsg("checkSlippage", errMsg);
                }
            } else if (
                IERC20(tokens[i]).balanceOf(address(this)) < amounts[i]
            ) {
                string memory errMsg = string(
                    abi.encodePacked(
                        "error: ",
                        _uint2String(i),
                        "_",
                        _uint2String(IERC20(tokens[i]).balanceOf(address(this)))
                    )
                );

                _revertMsg("checkSlippage", errMsg);
            }
        }
    }

    function getBalance(address token) external payable returns (uint256) {
        return _getBalance(token, type(uint256).max);
    }
}
