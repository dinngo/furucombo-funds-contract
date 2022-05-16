// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Errors} from "../../../utils/Errors.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";
import {ICurveLiquidityPool} from "./ICurveLiquidityPool.sol";

/// @title The curve stable resolver
contract RCurveStable is IAssetResolver, AssetResolverBase, Ownable {
    struct PoolInfo {
        address pool;
        address valuedAsset;
        uint256 valuedAssetDecimals;
    }

    uint256 private constant _VIRTUAL_PRICE_UNIT = 10**18;
    mapping(address => PoolInfo) public assetToPoolInfo;

    event PoolInfoSet(
        address indexed asset,
        address indexed pool,
        address indexed valuedAsset,
        uint256 valuedAssetDecimals
    );
    event PoolInfoRemoved(address indexed asset);

    /// @notice Set the pool info.
    /// @param asset_ The asset address.
    /// @param pool_ The pool address.
    /// @param valuedAsset_ The valued asset address.
    /// @param valuedAssetDecimals_ The decimals of value asset.
    function setPoolInfo(
        address asset_,
        address pool_,
        address valuedAsset_,
        uint256 valuedAssetDecimals_
    ) external onlyOwner {
        Errors._require(asset_ != address(0), Errors.Code.RCURVE_STABLE_ZERO_ASSET_ADDRESS);
        Errors._require(pool_ != address(0), Errors.Code.RCURVE_STABLE_ZERO_POOL_ADDRESS);
        Errors._require(valuedAsset_ != address(0), Errors.Code.RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS);
        Errors._require(
            valuedAssetDecimals_ == IERC20Metadata(valuedAsset_).decimals(),
            Errors.Code.RCURVE_STABLE_VALUED_ASSET_DECIMAL_NOT_MATCH_VALUED_ASSET
        );

        assetToPoolInfo[asset_] = PoolInfo({
            pool: pool_,
            valuedAsset: valuedAsset_,
            valuedAssetDecimals: valuedAssetDecimals_
        });

        emit PoolInfoSet(asset_, pool_, valuedAsset_, valuedAssetDecimals_);
    }

    /// @notice Remove the pool info.
    /// @param asset_ The asset address.
    function removePoolInfo(address asset_) external onlyOwner {
        Errors._require(assetToPoolInfo[asset_].pool != address(0), Errors.Code.RCURVE_STABLE_POOL_INFO_IS_NOT_SET);
        delete assetToPoolInfo[asset_];
        emit PoolInfoRemoved(asset_);
    }

    /// @notice Calculate asset value
    /// @param asset_ The asset address, and should be curve lp token.
    /// @param amount_ The amount of assets.
    /// @param quote_ The address of the quote token for which the value is calculated.
    /// @return The amount of quote token equal to the value.
    /// @dev The value must be positive.
    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external view returns (int256) {
        // Get pool info
        PoolInfo memory info = assetToPoolInfo[asset_];
        Errors._require(info.pool != address(0), Errors.Code.RCURVE_STABLE_POOL_INFO_IS_NOT_SET);

        // Calculate value
        uint256 underlyingAmount;
        uint256 virtualPrice = ICurveLiquidityPool(info.pool).get_virtual_price();
        if (info.valuedAssetDecimals == 18) {
            underlyingAmount = (amount_ * virtualPrice) / _VIRTUAL_PRICE_UNIT;
        } else {
            underlyingAmount =
                ((amount_ * virtualPrice * (10**info.valuedAssetDecimals)) / _VIRTUAL_PRICE_UNIT) /
                _VIRTUAL_PRICE_UNIT;
        }

        // Calculate underlying value
        int256 value = _calcAssetValue(info.valuedAsset, underlyingAmount, quote_);
        Errors._require(value >= 0, Errors.Code.RESOLVER_ASSET_VALUE_NEGATIVE);
        return value;
    }
}
