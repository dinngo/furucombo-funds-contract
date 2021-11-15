// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "../libs/LibUniqueAddressList.sol";
import {ModuleBase} from "./ModuleBase.sol";
import {Whitelist} from "../libraries/Whitelist.sol";

abstract contract AssetModule is ModuleBase {
    using LibUniqueAddressList for LibUniqueAddressList.List;
    using Whitelist for Whitelist.AssetWList;

    LibUniqueAddressList.List private _assetList;
    Whitelist.AssetWList private _assetWList;

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

    function _permitAsset(address asset)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _assetWList.permit(0, asset);
    }

    function _forbidAsset(address asset)
        internal
        whenStates(State.Initializing, State.Ready)
    {
        _assetWList.forbid(0, asset);
    }

    function _isValidAsset(address asset) internal view returns (bool) {
        return
            _assetWList.canCall(0, address(0)) || _assetWList.canCall(0, asset);
    }

    function _getAssetList() internal view returns (address[] memory) {
        return _assetList.get();
    }

    function _getReserve() internal view returns (uint256) {
        return denomination.balanceOf(address(vault));
    }
}
