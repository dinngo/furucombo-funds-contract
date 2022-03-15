// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SimpleToken
 * @dev Very simple ERC20 Token example, where all tokens are pre-assigned to the creator.
 * Note they can later distribute these tokens as they wish using `transfer` and other
 * `StandardToken` functions.
 */
contract SimpleToken is ERC20("SimpleToken", "SIM") {
    using SafeERC20 for ERC20;

    uint256 public constant INITIAL_SUPPLY = 10000 * (10**uint256(18));

    /**
     * @dev Constructor that gives msg.sender all of existing tokens.
     */
    constructor() {
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function move(
        address sender,
        address recipient,
        uint256 amount
    ) external {
        _transfer(sender, recipient, amount);
    }

    function grossTotalShare() external view returns (uint256) {
        return totalSupply();
    }

    function netTotalShare() external view returns (uint256) {
        return totalSupply() - balanceOf(address(1)) - balanceOf(address(2));
    }
}
