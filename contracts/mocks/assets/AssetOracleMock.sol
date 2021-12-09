// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../assets/interfaces/IAssetOracle.sol";

contract AssetOracleMock is IAssetOracle {
    function calcConversionAmount(
        address base,
        uint256 amount,
        address quote
    ) external pure override returns (uint256) {
        base;
        quote;
        return amount * 2;
    }
}
