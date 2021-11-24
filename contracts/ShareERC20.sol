// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ShareERC20 is ERC20Permit, Ownable {
    constructor(string memory name_, string memory symbol_)
        ERC20Permit(name_)
        ERC20(name_, symbol_)
    {}

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
        return totalSupply();
    }

    function grossTotalShare() external view returns (uint256) {
        return totalSupply() - balanceOf(address(0));
    }
}
