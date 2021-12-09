// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAssetResolver {
    function calcAssetValue(
        address,
        uint256,
        address
    ) external view returns (int256);
}
