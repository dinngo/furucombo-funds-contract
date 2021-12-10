// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../../interfaces/IAssetRouter.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../interfaces/IAssetOracle.sol";
import "./IUniswapV2Pair.sol";

contract RQuickSwap is IAssetResolver {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        IAssetOracle oracle = IAssetOracle(IAssetRouter(msg.sender).oracle());
        IUniswapV2Pair pair = IUniswapV2Pair(asset);

        uint256 totalSupply = pair.totalSupply();
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();

        uint256 amount0 = (amount * reserve0) / totalSupply;
        uint256 amount1 = (amount * reserve1) / totalSupply;

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
}
