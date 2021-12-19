// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../interfaces/IAssetRouter.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../interfaces/IUniswapV2Pair.sol";
import "../../interfaces/IAssetOracle.sol";
import "../../AssetResolverBase.sol";
import "hardhat/console.sol";

contract RQuickSwap is IAssetResolver, AssetResolverBase {
    using SafeERC20 for IERC20;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        IUniswapV2Pair pair = IUniswapV2Pair(asset);

        IERC20 token0 = IERC20(pair.token0());
        IERC20 token1 = IERC20(pair.token1());

        (uint256 amount0, uint256 amount1) = _calcAmountOut(
            pair,
            token0,
            token1,
            amount
        );
        console.log("token0", address(token0));
        console.log("token1", address(token1));

        console.log("amount0", amount0);
        console.log("amount1", amount1);
        int256 value0 = _calcAssetValue(address(token0), amount0, quote);
        int256 value1 = _calcAssetValue(address(token1), amount1, quote);

        console.log("value0", uint256(value0));

        console.log("value1", uint256(value1));
        return value0 + value1;
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
