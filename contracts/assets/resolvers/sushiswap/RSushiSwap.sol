// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAssetRouter.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../interfaces/IAssetOracle.sol";
import "../../interfaces/IUniswapV2Pair.sol";


contract RSushiSwap is IAssetResolver {
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        IAssetOracle oracle = IAssetOracle(IAssetRouter(msg.sender).oracle());
        IUniswapV2Pair pair = IUniswapV2Pair(asset);

        IERC20 token0 = IERC20(pair.token0());
        IERC20 token1 = IERC20(pair.token1());

        (uint256 amount0, uint256 amount1) = _calcAmountOut(
            pair,
            token0,
            token1,
            amount
        );

        // TODO: should we block it if amount = 0?
        // require(
        //     amount0 > 0 && amount1 > 0,
        //     "QuickSwap: INSUFFICIENT_LIQUIDITY_BURNED"
        // );

        uint256 value0 = oracle.calcConversionAmount(
            pair.token0(),
            amount0,
            quote
        );
        uint256 value1 = oracle.calcConversionAmount(
            pair.token1(),
            amount1,
            quote
        );

        return (value0 + value1).toInt256();
    }

    function _calcAmountOut(
        IUniswapV2Pair pair,
        IERC20 token0,
        IERC20 token1,
        uint256 amount
    ) internal view returns (uint256, uint256) {
        uint256 balance0 = token0.balanceOf(address(pair));
        uint256 balance1 = token1.balanceOf(address(pair));
        uint256 supply = pair.totalSupply();
        uint256 liquidity = (pair.balanceOf(address(pair))) + amount;
        uint256 amount0 = (liquidity * balance0) / supply;
        uint256 amount1 = (liquidity * balance1) / supply;
        return (amount0, amount1);
    }
}
