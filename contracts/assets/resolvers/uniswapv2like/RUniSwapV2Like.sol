// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IUniswapV2Factory} from "../../../interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../../interfaces/IUniswapV2Pair.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RUniSwapV2Like is IAssetResolver, AssetResolverBase {
    using SafeCast for int256;

    uint256 private constant _BONE = 10**18;

    /// @notice Calculate asset value given the amount.
    /// @param asset_ The asset address.
    /// @param amount_ The base asset amount.
    /// @param quote_ The quote asset address.
    /// @return The asset value in quote.
    function calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) external view returns (int256) {
        // use Weighted Geometric Mean
        // formula = 2*(K*P0*P1)^0.5/totalSupply
        // K: reserve0 * reserve1
        // Pi: price of tokeni from oracle
        // totalSupply: total share of the pool(include protocol fee)

        IUniswapV2Pair pair = IUniswapV2Pair(asset_);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        uint256 reserve0value = _calcAssetValue(pair.token0(), reserve0, quote_).toUint256();

        uint256 reserve1value = _calcAssetValue(pair.token1(), reserve1, quote_).toUint256();
        uint256 square = __uniswapSqrt(reserve0value * reserve1value);
        uint256 totalSupply = _getTotalSupplyAtWithdrawal(pair, reserve0, reserve1);

        // Use Bone to avoid calculation loss
        uint256 value = (((2 * square * amount_ * _BONE) / totalSupply) / _BONE);
        return _castAssetValue(value);
    }

    /// @notice Returns Uniswap V2 pair total supply at the time of withdrawal.
    /// @param pair_ The asset address.
    /// @param reserve0_ The reserve0 amount of pair.
    /// @param reserve1_ The reserve1 amount of pair.
    /// @return totalSupply The total supply of pair include fee liquidity.
    function _getTotalSupplyAtWithdrawal(
        IUniswapV2Pair pair_,
        uint256 reserve0_,
        uint256 reserve1_
    ) private view returns (uint256 totalSupply) {
        totalSupply = pair_.totalSupply();
        address feeTo = IUniswapV2Factory(pair_.factory()).feeTo();

        if (feeTo != address(0)) {
            uint256 kLast = pair_.kLast();
            if (kLast != 0) {
                uint256 rootK = __uniswapSqrt(reserve0_ * reserve1_);
                uint256 rootKLast = __uniswapSqrt(kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = (rootK * 5) + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    totalSupply = totalSupply + liquidity;
                }
            }
        }
    }

    /// @dev Uniswap square root function. See:
    /// https://github.com/Uniswap/uniswap-lib/blob/6ddfedd5716ba85b905bf34d7f1f3c659101a1bc/contracts/libraries/Babylonian.sol
    function __uniswapSqrt(uint256 y_) private pure returns (uint256 z) {
        if (y_ > 3) {
            z = y_;
            uint256 x = y_ / 2 + 1;
            while (x < z) {
                z = x;
                x = (y_ / x + x) / 2;
            }
        } else if (y_ != 0) {
            z = 1;
        }
        // else z = 0
    }
}
