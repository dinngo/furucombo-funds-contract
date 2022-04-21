// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Errors} from "../utils/Errors.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";
import {IAssetOracle} from "./interfaces/IAssetOracle.sol";
import {IAssetRouter} from "./interfaces/IAssetRouter.sol";
import {IAssetResolver} from "./interfaces/IAssetResolver.sol";

contract AssetRouter is IAssetRouter, Ownable {
    using SafeCast for uint256;

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
        // avoid redundant calculation
        if (asset_ == quote_) {
            return amount_.toInt256();
        }

        // return zero value directly
        if (amount_ == 0) {
            return 0;
        }

        IAssetResolver resolver = IAssetResolver(registry.resolvers(asset_));
        return resolver.calcAssetValue(asset_, amount_, quote_);
    }
}
