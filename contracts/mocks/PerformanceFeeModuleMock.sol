// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {LibFee} from "../libraries/LibFee.sol";
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

    function mintShareToken(address user, uint256 share) public {
        _updatePerformanceFee(grossAssetValueMock);
        shareToken.mint(user, share);
        _updateGrossSharePrice(grossAssetValueMock);
    }

    function setPerformanceFeeRate(uint256 feeRate) public returns (int128) {
        return _setPerformanceFeeRate(feeRate);
    }

    function setCrystallizationPeriod(uint256 period) public {
        _setCrystallizationPeriod(period);
    }

    function initializePerformanceFee() public {
        _initializePerformanceFee();
    }

    function updatePerformanceFee() public {
        _updatePerformanceFee(grossAssetValueMock);
    }

    function updateGrossSharePrice() public {
        _updateGrossSharePrice(grossAssetValueMock);
    }

    function getFeeBase() public pure returns (uint256) {
        return 1e4;
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

    function __getGrossAssetValue() internal view override returns (uint256) {
        return grossAssetValueMock;
    }
}
