// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../assets/AssetRouter.sol";

contract AssetRouterMock is AssetRouter {
    using SafeERC20 for IERC20;

    constructor(address _oracle, address _registry)
        AssetRouter(_oracle, _registry)
    {
        this;
    }

    function calcAssetValue(
        address asset,
        uint256 amount,
        address quote
    ) external view returns (int256) {
        return _calcAssetValue(asset, amount, quote);
    }
}
