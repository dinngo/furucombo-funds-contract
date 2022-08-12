// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RAaveProtocolV3Debt} from "../../assets/resolvers/aavev3/RAaveProtocolV3Debt.sol";

contract RAaveProtocolV3DebtMock is RAaveProtocolV3Debt {
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
