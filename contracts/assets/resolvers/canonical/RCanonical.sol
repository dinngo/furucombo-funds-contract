// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";

import "../../interfaces/IAssetRouter.sol";

import "../../interfaces/IAssetRouter.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../interfaces/IAssetOracle.sol";

contract RCanonical is IAssetResolver {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        IAssetOracle oracle = IAssetOracle(IAssetRouter(msg.sender).oracle());
        return oracle.calcConversionAmount(asset, amount, quote).toInt256();
    }
}
