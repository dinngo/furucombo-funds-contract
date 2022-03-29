// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {LibFee} from "../libraries/LibFee.sol";
import {Errors} from "../utils/Errors.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

/// @title Performance fee module
abstract contract PerformanceFeeModule is FundProxyStorageUtils {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for int256;
    using ABDKMath64x64 for uint256;

    int128 private constant _FEE_BASE64x64 = 1 << 64;
    uint256 private constant _FEE_PERIOD = 31557600; // 365.25*24*60*60
    uint256 private constant _FEE_DENOMINATOR = _FUND_PERCENTAGE_BASE * _FEE_PERIOD;
    address private constant _OUTSTANDING_ACCOUNT = address(1);

    event PerformanceFeeClaimed(address indexed manager, uint256 shareAmount);

    /// @notice Initial the performance fee crystallization time
    /// and high water mark.
    function _initializePerformanceFee() internal virtual {
        lastGrossSharePrice64x64 = _FEE_BASE64x64;
        hwm64x64 = lastGrossSharePrice64x64;
        _crystallizationStart = block.timestamp;
        _lastCrystallization = block.timestamp;
    }

    /// @notice Get the performance fee rate of the fund.
    function getPerformanceFeeRate() public view returns (int128) {
        return _pFeeRate64x64;
    }

    /// @notice Get the crystallization period of the fund.
    function getCrystallizationPeriod() public view returns (uint256) {
        return _crystallizationPeriod;
    }

    /// @notice Check if it can be crystallized.
    function isCrystallizable() public view virtual returns (bool) {
        uint256 nowPeriod = _timeToPeriod(block.timestamp);
        uint256 lastPeriod = _timeToPeriod(_lastCrystallization);
        return nowPeriod > lastPeriod;
    }

    /// @notice Returns the earliest time that can be crystallized next
    /// even if more than one period has passed.
    function getNextCrystallizationTime() public view returns (uint256) {
        uint256 lastPeriod = _timeToPeriod(_lastCrystallization);
        return _periodToTime(lastPeriod + 1);
    }

    /// @notice Set the performance fee rate.
    /// @param feeRate The fee rate on a 1e4 basis.
    function _setPerformanceFeeRate(uint256 feeRate) internal virtual returns (int128) {
        Errors._require(
            feeRate < _FUND_PERCENTAGE_BASE,
            Errors.Code.PERFORMANCE_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_BASE
        );
        _pFeeRate64x64 = feeRate.divu(_FUND_PERCENTAGE_BASE);
        return _pFeeRate64x64;
    }

    /// @notice Set the crystallization period.
    /// @param period The crystallization period to be set in second.
    function _setCrystallizationPeriod(uint256 period) internal virtual {
        Errors._require(period > 0, Errors.Code.PERFORMANCE_FEE_MODULE_CRYSTALLIZATION_PERIOD_TOO_SHORT);
        _crystallizationPeriod = period;
    }

    /// @notice Crystallize for the performance fee.
    /// @return Return the performance fee amount to be claimed.
    function crystallize() public virtual returns (uint256) {
        Errors._require(isCrystallizable(), Errors.Code.PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET);
        uint256 grossAssetValue = __getGrossAssetValue();
        _updatePerformanceFee(grossAssetValue);
        address manager = owner();
        shareToken.move(_OUTSTANDING_ACCOUNT, manager, _lastOutstandingShare);
        _updateGrossSharePrice(grossAssetValue);
        uint256 result = _lastOutstandingShare;
        _lastOutstandingShare = 0;
        _pFeeSum = 0;
        _lastCrystallization = block.timestamp;
        hwm64x64 = LibFee._max64x64(hwm64x64, lastGrossSharePrice64x64);
        emit PerformanceFeeClaimed(manager, result);

        return result;
    }

    /// @notice Update the performance fee base on the performance since last
    /// time. The fee will be minted as outstanding share.
    function _updatePerformanceFee(uint256 grossAssetValue_) internal virtual {
        // Get accumulated wealth
        uint256 totalShare = shareToken.netTotalShare();
        if (totalShare == 0) {
            return;
        }
        int128 grossSharePrice64x64 = grossAssetValue_.divu(totalShare);
        int256 wealth = LibFee
            ._max64x64(hwm64x64, grossSharePrice64x64)
            .sub(LibFee._max64x64(hwm64x64, lastGrossSharePrice64x64))
            .muli(int256(totalShare));
        int256 fee = _pFeeRate64x64.muli(wealth);
        _pFeeSum = uint256(LibFee._max(0, int256(_pFeeSum) + fee));
        uint256 netAssetValue = grossAssetValue_ - _pFeeSum;
        uint256 outstandingShare = (totalShare * _pFeeSum) / netAssetValue;
        if (outstandingShare > _lastOutstandingShare) {
            shareToken.mint(_OUTSTANDING_ACCOUNT, outstandingShare - _lastOutstandingShare);
        } else {
            shareToken.burn(_OUTSTANDING_ACCOUNT, _lastOutstandingShare - outstandingShare);
        }
        _lastOutstandingShare = outstandingShare;
        lastGrossSharePrice64x64 = grossAssetValue_.divu(totalShare);
    }

    /// @notice Update the gross share price as the basis for estimating the
    /// future performance.
    function _updateGrossSharePrice(uint256 grossAssetValue_) internal virtual {
        uint256 totalShare = shareToken.netTotalShare();
        if (totalShare == 0) {
            lastGrossSharePrice64x64 = _FEE_BASE64x64;
        } else {
            lastGrossSharePrice64x64 = grossAssetValue_.divu(totalShare);
        }
    }

    /// @notice Convert the time to the number of crystallization periods.
    function _timeToPeriod(uint256 timestamp) internal view returns (uint256) {
        Errors._require(timestamp >= _crystallizationStart, Errors.Code.PERFORMANCE_FEE_MODULE_TIME_BEFORE_START);
        return (timestamp - _crystallizationStart) / _crystallizationPeriod;
    }

    /// @notice Convert the number of crystallization periods to time.
    function _periodToTime(uint256 period) internal view returns (uint256) {
        return _crystallizationStart + period * _crystallizationPeriod;
    }

    function __getGrossAssetValue() internal view virtual returns (uint256);
}
