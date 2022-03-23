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

    constructor(address _oracle, address _registry) Ownable() {
        oracle = IAssetOracle(_oracle);
        registry = IAssetRegistry(_registry);
    }

    function setOracle(address _oracle) external override onlyOwner {
        oracle = IAssetOracle(_oracle);
    }

    function setRegistry(address _registry) external override onlyOwner {
        registry = IAssetRegistry(_registry);
    }

    function calcAssetsTotalValue(
        address[] calldata assets,
        uint256[] calldata amounts,
        address quote
    ) external view override returns (uint256) {
        Errors._require(
            assets.length == amounts.length,
            Errors.Code.ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT
        );

        int256 totalValue;
        for (uint256 i = 0; i < assets.length; ++i) {
            totalValue += calcAssetValue(assets[i], amounts[i], quote);
        }

        Errors._require(
            totalValue >= 0,
            Errors.Code.ASSET_ROUTER_NEGATIVE_VALUE
        );
        return uint256(totalValue);
    }

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) public view returns (int256) {
        uint256 assetAmount = _getAssetAmount(asset, amount);
        if (assetAmount == 0) {
            return 0;
        }

        IAssetResolver resolver = IAssetResolver(registry.resolvers(asset));
        return resolver.calcAssetValue(asset, assetAmount, quote);
    }

    function _getAssetAmount(address asset, uint256 amount)
        internal
        view
        returns (uint256)
    {
        if (amount == type(uint256).max) {
            amount = IERC20(asset).balanceOf(msg.sender);
        }
        return amount;
    }
}
