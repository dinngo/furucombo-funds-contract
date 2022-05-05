// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";
import {PerformanceFeeModule} from "../modules/PerformanceFeeModule.sol";

contract PerformanceFeeModuleMock is PerformanceFeeModule {
    using ABDKMath64x64 for uint256;
    uint256 public grossAssetValueMock;

    function setShareToken(IShareToken shareToken_) public {
        shareToken = shareToken_;
    }

    function setGrossAssetValue(uint256 grossAssetValue_) public {
        grossAssetValueMock = grossAssetValue_;
    }

    function getGrossAssetValue() public view returns (uint256) {
        return grossAssetValueMock;
    }

    function mintShareToken(address user_, uint256 share_) public {
        _updatePerformanceFee(grossAssetValueMock);
        shareToken.mint(user_, share_);
        _updateGrossSharePrice(grossAssetValueMock);
    }

    function setPerformanceFeeRate(uint256 feeRate_) public returns (int128) {
        return _setPerformanceFeeRate(feeRate_);
    }

    function setCrystallizationPeriod(uint256 period_) public {
        _setCrystallizationPeriod(period_);
    }

    function initializePerformanceFee() public {
        _initializePerformanceFee();
    }

    function updatePerformanceFee() public {
        _updatePerformanceFee(grossAssetValueMock);
    }

    function getFeeBase() public pure returns (uint256) {
        return _FUND_PERCENTAGE_BASE;
    }

    function getFeeBase64x64() public pure returns (uint256) {
        return 1 << 64;
    }

    function getRateBase() public pure returns (int128) {
        return uint256(1).fromUInt();
    }

    function getFeePeriod() public pure returns (uint256) {
        return 31557600;
    }

    function timeToPeriod(uint256 timestamp_) public view returns (uint256) {
        return _timeToPeriod(timestamp_);
    }

    function __getGrossAssetValue() internal view override returns (uint256) {
        return grossAssetValueMock;
    }
}
