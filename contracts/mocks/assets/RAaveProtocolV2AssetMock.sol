// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RAaveProtocolV2Asset} from "../../assets/resolvers/aavev2/RAaveProtocolV2Asset.sol";

contract RAaveProtocolV2AssetMock is RAaveProtocolV2Asset {
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
