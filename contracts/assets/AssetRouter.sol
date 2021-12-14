// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAssetRegistry.sol";
import "./interfaces/IAssetRouter.sol";
import "./interfaces/IAssetResolver.sol";

contract AssetRouter is IAssetRouter, Ownable {
    using SafeERC20 for IERC20;

    IAssetOracle public override oracle;
    IAssetRegistry public override registry;

    constructor(address _oracle, address _registry) Ownable() {
        oracle = IAssetOracle(_oracle);
        registry = IAssetRegistry(_registry);
    }

    function setOracle(address _oracle) external override onlyOwner {
        oracle = IAssetOracle(_oracle);
    }

    function setRegistry(address _registry) external override onlyOwner {
        registry = IAssetRegistry(_registry);
    }

    function calcAssetsTotalValue(
        address[] calldata assets,
        uint256[] calldata amounts,
        address quote
    ) external view override returns (uint256) {
        require(
            assets.length == amounts.length,
            "assets length != amounts length"
        );

        int256 totalValue;
        for (uint256 i = 0; i < assets.length; ++i) {
            totalValue += _calcAssetValue(assets[i], amounts[i], quote);
        }

        require(totalValue >= 0, "negative value");
        return uint256(totalValue);
    }

    function _calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) internal view returns (int256) {
        IAssetResolver resolver = IAssetResolver(registry.resolvers(asset));
        return
            resolver.calcAssetValue(
                asset,
                _getAssetAmount(asset, amount),
                quote
            );
    }

    function _getAssetAmount(address asset, uint256 amount)
        internal
        view
        returns (uint256)
    {
        if (amount == type(uint256).max) {
            amount = IERC20(asset).balanceOf(msg.sender);
        }
        return amount;
    }
}
