// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract AssetModule is ModuleBase {
    mapping(address => address) private _predecessor;
    mapping(address => address) private _successor;
    uint256 private _assetCount;

    function getAssetValue() public view returns (uint256 assetValue) {
        this;
        return 0;
    }

    function getAssetList() public view returns (address[] memory assetList) {
        assetList = new address[](_assetCount);
        uint256 index = 0;
        for (
            address p = _successor[address(0)];
            _successor[p] != address(0);
            p = _successor[p]
        ) {
            assetList[0] = p;
            index++;
        }
    }

    function getReserve() public view returns (uint256) {
        return denomination.balanceOf(address(vault));
    }

    function addAsset(address asset) public {
        // Should check asset value exists
        if (_assetCount == 0) {
            _predecessor[address(0)] = asset;
            _successor[address(0)] = asset;
        } else {
            address tail = _predecessor[address(0)];
            _successor[tail] = asset;
            _predecessor[asset] = tail;
            _predecessor[address(0)] = asset;
        }
        _assetCount++;
    }

    function removeAsset(address asset) public {
        // Should check asset value zero
        if (_assetCount == 0) {
            revert("List empty");
        } else {
            address succ = _successor[asset];
            address pred = _predecessor[asset];
            _successor[pred] = succ;
            _assetCount--;
        }
    }
}
