// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAssetOracle {
    function calcConversionAmount(
        address base,
        uint256 baseAmount,
        address quote
    ) external view returns (uint256);
}
