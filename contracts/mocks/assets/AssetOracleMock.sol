// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAssetOracle} from "../../assets/interfaces/IAssetOracle.sol";

contract AssetOracleMock is IAssetOracle {
    function calcConversionAmount(
        address base_,
        uint256 baseAmount_,
        address quote_
    ) external pure override returns (uint256) {
        base_;
        quote_;
        return baseAmount_ * 2;
    }
}
