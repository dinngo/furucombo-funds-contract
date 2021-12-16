// SPDX-License-Identifier: MIT

import "./IAssetRegistry.sol";
import "./IAssetOracle.sol";

pragma solidity ^0.8.0;

interface IAssetRouter {
    function oracle() external view returns (IAssetOracle);

    function registry() external view returns (IAssetRegistry);

    function setOracle(address oracle) external;

    function setRegistry(address registry) external;

    function calcAssetsTotalValue(
        address[] calldata bases,
        uint256[] calldata amounts,
        address quote
    ) external view returns (uint256);

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view returns (int256);
}
