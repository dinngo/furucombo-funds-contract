// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {LibFee} from "../libraries/LibFee.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

import "hardhat/console.sol";

/// @title Performance fee implementation
abstract contract PerformanceFee {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for int256;
    using ABDKMath64x64 for uint256;

    int128 private _feeRate64x64;
    uint256 private constant FEE_BASE = 1e4;
    int128 private constant FEE_BASE64x64 = 1 << 64;
    uint256 private constant FEE_PERIOD = 31557600; // 365.25*24*60*60
    uint256 private constant FEE_DENOMINATOR = FEE_BASE * FEE_PERIOD;
    int128 public hwm64x64; // should be a float point number
    int128 public lastGrossSharePrice64x64;
    uint256 private _feeSum;
    uint256 private _lastOutstandingShare;
    uint256 private _crystallizationPeriod;
    uint256 private lastCrystallization;
    address private constant _OUTSTANDING_ACCOUNT = address(1);

    function initializePerformanceFee() public virtual {
        lastGrossSharePrice64x64 = 1 << 64;
        hwm64x64 = lastGrossSharePrice64x64;
        lastCrystallization = block.timestamp;
    }

    function getFeeRate() public view returns (int128) {
        return _feeRate64x64;
    }

    function getCrystallizationPeriod() public view returns (uint256) {
        return _crystallizationPeriod;
    }

    /// @notice Set the performance fee rate.
    /// @param feeRate The fee rate on a 1e4 basis.
    function _setPerformanceFeeRate(uint256 feeRate)
        internal
        virtual
        returns (int128)
    {
        require(feeRate < FEE_BASE, "rate should be less than 100%");
        _feeRate64x64 = feeRate.divu(FEE_BASE);

        return _feeRate64x64;
    }

    /// @notice Set the crystallization period.
    /// @param period The crystallization period to be set in second.
    function _setCrystallizationPeriod(uint256 period) internal virtual {
        _crystallizationPeriod = period;
    }

    /// @notice Crystallize for the performance fee.
    /// @return Return the performance fee amount to be claimed.
    function crystallize() public virtual returns (uint256) {
        require(
            block.timestamp > lastCrystallization + _crystallizationPeriod,
            "Not yet"
        );
        _updatePerformanceFee();
        require(_feeSum > 0, "No fee to crystallize");
        IShareToken shareToken = __getShareToken();
        address manager = __getManager();
        shareToken.move(_OUTSTANDING_ACCOUNT, manager, _lastOutstandingShare);
        _updateGrossSharePrice();
        uint256 result = _lastOutstandingShare;
        _lastOutstandingShare = 0;
        _feeSum = 0;
        lastCrystallization = block.timestamp;
        hwm64x64 = lastGrossSharePrice64x64;
        return result;
    }

    /// @notice Update the performance fee base on the performance since last
    /// time. The fee will be minted as outstanding share.
    function _updatePerformanceFee() internal virtual {
        IShareToken shareToken = __getShareToken();
        // Get accumulated wealth
        uint256 grossAssetValue = __getGrossAssetValue();
        uint256 totalShare = shareToken.grossTotalShare();
        if (totalShare == 0) {
            return;
        }
        int128 grossSharePrice64x64 = grossAssetValue.divu(totalShare);
        int256 wealth = LibFee
            ._max64x64(hwm64x64, grossSharePrice64x64)
            .sub(LibFee._max64x64(hwm64x64, lastGrossSharePrice64x64))
            .muli(int256(totalShare));
        int256 fee = _feeRate64x64.muli(wealth);
        _feeSum = uint256(LibFee._max(0, int256(_feeSum) + fee));
        uint256 netAssetValue = grossAssetValue - _feeSum;
        uint256 outstandingShare = (totalShare * _feeSum) / netAssetValue;
        if (outstandingShare > _lastOutstandingShare) {
            shareToken.mint(
                _OUTSTANDING_ACCOUNT,
                outstandingShare - _lastOutstandingShare
            );
        } else {
            shareToken.burn(
                _OUTSTANDING_ACCOUNT,
                _lastOutstandingShare - outstandingShare
            );
        }
        _lastOutstandingShare = outstandingShare;
        lastGrossSharePrice64x64 = grossAssetValue.divu(
            totalShare + outstandingShare
        );
        console.log("Price is");
        console.logInt(lastGrossSharePrice64x64);
    }

    /// @notice Update the gross share price as the basis for estimating the
    /// future performance.
    function _updateGrossSharePrice() internal virtual {
        IShareToken shareToken = __getShareToken();
        uint256 grossAssetValue = __getGrossAssetValue();
        uint256 totalShare = shareToken.grossTotalShare();
        lastGrossSharePrice64x64 = grossAssetValue.divu(totalShare);
        console.log("Price is");
        console.logInt(lastGrossSharePrice64x64);
    }

    /// @notice Payout a portion of performance fee without the limitation of
    /// crystallization.
    /// @param amount The share amount being redeemed.
    function _redemptionPayout(uint256 amount) internal virtual {
        IShareToken shareToken = __getShareToken();
        address manager = __getManager();
        uint256 totalShare = shareToken.netTotalShare();
        console.log("totalShare is %s, amount is %s", totalShare, amount);
        uint256 payout = (_lastOutstandingShare * amount) / totalShare;
        console.log("payout is %s", payout);
        uint256 fee = (_feeSum * amount) / totalShare;
        console.log("fee is %s", fee);
        shareToken.move(_OUTSTANDING_ACCOUNT, manager, payout);
        _lastOutstandingShare -= payout;
        _feeSum -= fee;
    }

    /// @notice Get the share token of the pool.
    function __getShareToken() internal view virtual returns (IShareToken);

    /// @notice Get the gross asset value of the pool.
    function __getGrossAssetValue() internal view virtual returns (uint256);

    /// @notice Get the pool manager.
    function __getManager() internal virtual returns (address);
}
