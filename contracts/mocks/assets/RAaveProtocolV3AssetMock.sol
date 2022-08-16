// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RAaveProtocolV3Asset} from "../../assets/resolvers/aavev3/RAaveProtocolV3Asset.sol";

contract RAaveProtocolV3AssetMock is RAaveProtocolV3Asset {
    function _calcAssetValue(
        address asset_,
        uint256 amount_,
        address quote_
    ) internal pure override returns (int256) {
        asset_;
        quote_;
        return -int256(amount_);
    }
}
