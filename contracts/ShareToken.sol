// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {Errors} from "./utils/Errors.sol";

contract ShareToken is ERC20Permit, Ownable, IShareToken {
    uint8 private immutable _decimals;
    address private constant _OUTSTANDING_PERFORMANCE_FEE_ACCOUNT = address(1);
    address private constant _FINALIZED_PERFORMANCE_FEE_ACCOUNT = address(2);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20Permit(name_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }

    function move(
        address sender,
        address recipient,
        uint256 amount
    ) external onlyOwner {
        _transfer(sender, recipient, amount);
    }

    function netTotalShare() external view returns (uint256) {
        return totalSupply() - balanceOf(address(1)) - balanceOf(address(2));
    }

    function grossTotalShare() external view returns (uint256) {
        return totalSupply();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        if (to == _OUTSTANDING_PERFORMANCE_FEE_ACCOUNT) {
            Errors._require(
                from == address(0),
                Errors.Code.SHARE_TOKEN_INVALID_TO
            );
        } else if (to == _FINALIZED_PERFORMANCE_FEE_ACCOUNT) {
            Errors._require(
                from == _OUTSTANDING_PERFORMANCE_FEE_ACCOUNT,
                Errors.Code.SHARE_TOKEN_INVALID_TO
            );
        }
        super._beforeTokenTransfer(from, to, amount);
    }
}
