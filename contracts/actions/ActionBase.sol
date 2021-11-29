// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IERC20Usdt.sol";
import "../utils/FundQuotaAction.sol";
import "../utils/DealingAssetAction.sol";

abstract contract ActionBase is FundQuotaAction, DealingAssetAction {
    using SafeERC20 for IERC20;

    // prettier-ignore
    address public constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function _getBalance(address token) internal view returns (uint256) {
        return _getBalanceWithAmount(token, type(uint256).max);
    }

    function _getBalanceWithAmount(address token, uint256 amount)
        internal
        view
        returns (uint256)
    {
        if (amount != type(uint256).max) {
            return amount;
        }

        // Native token
        if (token == NATIVE_TOKEN_ADDRESS) {
            return address(this).balance;
        }
        // ERC20 token
        return IERC20(token).balanceOf(address(this));
    }

    function _tokenApprove(
        address token,
        address spender,
        uint256 amount
    ) internal {
        try IERC20Usdt(token).approve(spender, amount) {} catch {
            IERC20(token).safeApprove(spender, 0);
            IERC20(token).safeApprove(spender, amount);
        }
    }
}
