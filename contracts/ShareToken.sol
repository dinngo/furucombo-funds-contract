// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {Errors} from "./utils/Errors.sol";

/// @title Furucombo Fund Share Token
contract ShareToken is ERC20Permit, Ownable, IShareToken {
    address private constant _OUTSTANDING_PERFORMANCE_FEE_ACCOUNT = address(1);
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20Permit(name_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @notice Get net total share, exclude outstanding performance fee.
    /// @return The net total share amount.
    function netTotalShare() external view returns (uint256) {
        return totalSupply() - balanceOf(_OUTSTANDING_PERFORMANCE_FEE_ACCOUNT);
    }

    /// @notice Get the gross total share.
    /// @return The gross total share amount.
    function grossTotalShare() external view returns (uint256) {
        return totalSupply();
    }

    /// @notice Mint share token amount to the account.
    /// @param account_ The receiver address.
    /// @param amount_ The share token amount.
    function mint(address account_, uint256 amount_) external onlyOwner {
        _mint(account_, amount_);
    }

    /// @notice Burn the share token amount of the account.
    /// @param account_ Burn share tokens from this address.
    /// @param amount_ The share token amount.
    function burn(address account_, uint256 amount_) external onlyOwner {
        _burn(account_, amount_);
    }

    /// @notice Move the share token between two accounts.
    /// @param from_ The address from which the share token was transferred.
    /// @param to_ The address to which the share token is transferred.
    /// @param amount_ The share token move amount.
    function move(
        address from_,
        address to_,
        uint256 amount_
    ) external onlyOwner {
        _transfer(from_, to_, amount_);
    }

    /// @notice Move tokens between two addresses using the allowance mechanism,
    ///         `amount` is then deducted from the spender's allowance.
    /// @param spender_ The spender address.
    /// @param from_ The address from which the chare token was transferred.
    /// @param to_ The address to which the share token is transferred.
    /// @param amount_ The share token transfer amount.
    function approvedMove(
        address spender_,
        address from_,
        address to_,
        uint256 amount_
    ) external onlyOwner {
        _spendAllowance(from_, spender_, amount_);
        _transfer(from_, to_, amount_);
    }

    /// @notice Set allowance amount.
    /// @param owner_ The owner address.
    /// @param spender_ The spender address.
    /// @param amount_ The share token approve amount.
    function setApproval(
        address owner_,
        address spender_,
        uint256 amount_
    ) external onlyOwner {
        _approve(owner_, spender_, amount_);
    }

    /// @notice Get the share token decimals.
    /// @return The decimals of share token.
    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Check the from address is valid and to is oustanding address.
    /// @param from_ The address from which the share token is transferred.
    /// @param to_ The address to which the share token is transferred.
    /// @param amount_ The share token transfer amount.
    /// @inheritdoc ERC20
    function _beforeTokenTransfer(
        address from_,
        address to_,
        uint256 amount_
    ) internal virtual override {
        Errors._require(from_ != address(this), Errors.Code.SHARE_TOKEN_INVALID_FROM);
        if (to_ == _OUTSTANDING_PERFORMANCE_FEE_ACCOUNT) {
            Errors._require(from_ == address(0), Errors.Code.SHARE_TOKEN_INVALID_TO);
        }
        super._beforeTokenTransfer(from_, to_, amount_);
    }
}
