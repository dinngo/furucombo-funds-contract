// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../../../utils/Errors.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";
import {ICurveLiquidityPool} from "./ICurveLiquidityPool.sol";

contract RCurveStable is IAssetResolver, AssetResolverBase, Ownable {
    event PoolInfoSet(
        address indexed asset,
        address indexed pool,
        address indexed valuedAsset,
        uint256 valuedAssetDecimals
    );
    event PoolInfoRemoved(address indexed asset);

    struct PoolInfo {
        address pool;
        address valuedAsset;
        uint256 valuedAssetDecimals;
    }

    uint256 private constant VIRTUAL_PRICE_UNIT = 10**18;
    mapping(address => PoolInfo) public assetToPoolInfo;

    function setPoolInfo(
        address _asset,
        address _pool,
        address _valuedAsset,
        uint256 _valuedAssetDecimals
    ) external onlyOwner {
        Errors._require(
            _asset != address(0),
            Errors.Code.RCURVE_STABLE_ZERO_ASSET_ADDRESS
        );
        Errors._require(
            _pool != address(0),
            Errors.Code.RCURVE_STABLE_ZERO_POOL_ADDRESS
        );
        Errors._require(
            _valuedAsset != address(0),
            Errors.Code.RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS
        );
        Errors._require(
            _valuedAssetDecimals > 0,
            Errors.Code.RCURVE_STABLE_ZERO_VALUED_ASSET_DECIMAL
        );

        assetToPoolInfo[_asset] = PoolInfo({
            pool: _pool,
            valuedAsset: _valuedAsset,
            valuedAssetDecimals: _valuedAssetDecimals
        });

        emit PoolInfoSet(_asset, _pool, _valuedAsset, _valuedAssetDecimals);
    }

    function removePoolInfo(address _asset) external onlyOwner {
        Errors._require(
            assetToPoolInfo[_asset].pool != address(0),
            Errors.Code.RCURVE_STABLE_POOL_INFO_IS_NOT_SET
        );
        assetToPoolInfo[_asset] = PoolInfo(address(0), address(0), 0);
        emit PoolInfoRemoved(_asset);
    }

    function calcAssetValue(
        address asset, // should be curve lp token
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        // Get pool info
        PoolInfo memory info = assetToPoolInfo[asset];
        Errors._require(
            info.pool != address(0),
            Errors.Code.RCURVE_STABLE_POOL_INFO_IS_NOT_SET
        );

        // Calculate value
        uint256 underlyingAmount;
        uint256 virtualPrice = ICurveLiquidityPool(info.pool)
            .get_virtual_price();
        if (info.valuedAssetDecimals == 18) {
            underlyingAmount = (amount * virtualPrice) / VIRTUAL_PRICE_UNIT;
        } else {
            underlyingAmount =
                ((amount * virtualPrice * (10**info.valuedAssetDecimals)) /
                    VIRTUAL_PRICE_UNIT) /
                VIRTUAL_PRICE_UNIT;
        }

        // Calculate underlying value
        return _calcAssetValue(info.valuedAsset, underlyingAmount, quote);
    }
}
