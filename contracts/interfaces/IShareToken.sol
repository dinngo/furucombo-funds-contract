// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

interface IShareToken is IERC20, IERC20Permit {
    function mint(address account, uint256 amount) external;

    function burn(address account, uint256 amount) external;

    function move(
        address sender,
        address recipient,
        uint256 amount
    ) external;

    function netTotalShare() external view returns (uint256);

    function grossTotalShare() external view returns (uint256);
}
