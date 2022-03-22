// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV2Factory} from "../../../interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../../interfaces/IUniswapV2Pair.sol";
import {IAssetResolver} from "../../interfaces/IAssetResolver.sol";
import {AssetResolverBase} from "../../AssetResolverBase.sol";

contract RUniSwapV2Like is IAssetResolver, AssetResolverBase {
    using SafeERC20 for IERC20;
    uint256 private constant BONE = 10**18;

    /// @notice Calculate asset value given the amount.
    /// @param asset The asset address.
    /// @param amount The base asset amount.
    /// @param quote The quote asset address.
    /// @return The asset value in quote.
    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        // use Weighted Geometric Mean
        // formula = 2*(K*P0*P1)^0.5/totalSupply
        // K: reserve0 * reserve1
        // Pi: price of tokeni from oracle
        // totalSupply: total share of the pool(include protocol fee)

        IUniswapV2Pair pair = IUniswapV2Pair(asset);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        uint256 reserve0value = uint256(
            _calcAssetValue(pair.token0(), reserve0, quote)
        );

        uint256 reserve1value = uint256(
            _calcAssetValue(pair.token1(), reserve1, quote)
        );
        uint256 square = __uniswapSqrt(reserve0value * reserve1value);
        uint256 totalSupply = _getTotalSupplyAtWithdrawal(
            pair,
            reserve0,
            reserve1
        );

        // Use Bone to avoid calculation loss
        uint256 value = (((2 * square * amount * BONE) / totalSupply) / BONE);
        return _castAssetValue(value);
    }

    /// @notice Returns Uniswap V2 pair total supply at the time of withdrawal.
    /// @param pair The asset address.
    /// @param reserve0 The reserve0 amount of pair.
    /// @param reserve1 The reserve1 amount of pair.
    /// @return totalSupply The total supply of pair include fee liquidity.
    function _getTotalSupplyAtWithdrawal(
        IUniswapV2Pair pair,
        uint256 reserve0,
        uint256 reserve1
    ) private view returns (uint256 totalSupply) {
        totalSupply = pair.totalSupply();
        address feeTo = IUniswapV2Factory(pair.factory()).feeTo();

        if (feeTo != address(0)) {
            uint256 kLast = pair.kLast();
            if (kLast != 0) {
                uint256 rootK = __uniswapSqrt(reserve0 * reserve1);
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
    function __uniswapSqrt(uint256 _y) private pure returns (uint256 z_) {
        if (_y > 3) {
            z_ = _y;
            uint256 x = _y / 2 + 1;
            while (x < z_) {
                z_ = x;
                x = (_y / x + x) / 2;
            }
        } else if (_y != 0) {
            z_ = 1;
        }
        // else z_ = 0

        return z_;
    }
}
