// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "../../interfaces/IAssetRouter.sol";
import "../../interfaces/IAssetResolver.sol";
import "../../interfaces/IAssetOracle.sol";
import "./IATokenV2.sol";

contract RAaveProtocolV2Asset is IAssetResolver {
    using SafeCast for uint256;

    function calcAssetValue(
        address asset, // should be aToken
        uint256 amount,
        address quote
    ) external view override returns (int256) {
        address underlying = IATokenV2(asset).UNDERLYING_ASSET_ADDRESS();
        IAssetOracle oracle = IAssetOracle(IAssetRouter(msg.sender).oracle());
        return
            oracle.calcConversionAmount(underlying, amount, quote).toInt256();
    }
}
