// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../utils/Errors.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";
import {IAssetRouter} from "./interfaces/IAssetRouter.sol";
import {IAssetResolver} from "./interfaces/IAssetResolver.sol";

contract AssetRouter is IAssetRouter, Ownable {
    using SafeERC20 for IERC20;

    IAssetOracle public override oracle;
    IAssetRegistry public override registry;

    constructor(address oracle_, address registry_) Ownable() {
        oracle = IAssetOracle(oracle_);
        registry = IAssetRegistry(registry_);
    }

    function setOracle(address oracle_) external override onlyOwner {
        oracle = IAssetOracle(oracle_);
    }

    function setRegistry(address registry_) external override onlyOwner {
        registry = IAssetRegistry(registry_);
    }

    function calcAssetsTotalValue(
        address[] calldata assets_,
        uint256[] calldata amounts_,
        address quote_
    ) external view override returns (uint256) {
        Errors._require(
            assets_.length == amounts_.length,
            Errors.Code.ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT
        );

        int256 totalValue;
        for (uint256 i = 0; i < assets_.length; ++i) {
            totalValue += calcAssetValue(assets_[i], amounts_[i], quote_);
        }

        Errors._require(totalValue >= 0, Errors.Code.ASSET_ROUTER_NEGATIVE_VALUE);
        return uint256(totalValue);
    }

    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) public view returns (int256) {
        uint256 assetAmount = _getAssetAmount(asset_, amount_);
        if (assetAmount == 0) {
            return 0;
        }

        IAssetResolver resolver = IAssetResolver(registry.resolvers(asset_));
        return resolver.calcAssetValue(asset_, assetAmount, quote_);
    }

    function _getAssetAmount(address asset_, uint256 amount_) internal view returns (uint256) {
        if (amount_ == type(uint256).max) {
            amount_ = IERC20(asset_).balanceOf(msg.sender);
        }
        return amount_;
    }
}
