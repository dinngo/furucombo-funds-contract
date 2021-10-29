// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "../libs/LibUniqueAddressList.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract AssetModule is ModuleBase {
    using LibUniqueAddressList for LibUniqueAddressList.List;

    LibUniqueAddressList.List private _assetList;

    function getAssetValue() public view returns (uint256 assetValue) {
        this;
        return 0;
    }

    function getAssetList() public view returns (address[] memory) {
        return _assetList.get();
    }

    function getReserve() public view returns (uint256) {
        return denomination.balanceOf(address(vault));
    }

    function addAsset(address asset) public {
        // Should check asset value exists
        _assetList.pushBack(asset);
    }

    function removeAsset(address asset) public {
        // Should check asset value zero
        _assetList.remove(asset);
    }

    function close() public {
        require(
            _assetList.size() == 1 &&
                _assetList.front() == address(denomination),
            "Different asset remaining"
        );
        _enterState(State.Closed);
    }
}
