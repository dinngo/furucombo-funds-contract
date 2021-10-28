// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract AssetModule is ModuleBase {
    IERC20[] private _assetList;

    function getAssetValue() public view returns (uint256 assetValue) {
        this;
        return 0;
    }

    function getAssetList() public view returns (IERC20[] memory assetList) {
        return _assetList;
    }

    function getReserve() public view returns (uint256) {
        return denomination.balanceOf(address(vault));
    }
}
