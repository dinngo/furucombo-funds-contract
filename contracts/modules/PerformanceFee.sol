// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {LibFee} from "../libraries/LibFee.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

abstract contract PerformanceFee {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for int256;
    using ABDKMath64x64 for uint256;

    int128 private _feeRate64x64;
    uint256 private constant FEE_BASE = 10000;
    int128 private constant FEE_BASE64x64 = 0x100000000;
    uint256 private constant FEE_PERIOD = 31557600; // 365.25*24*60*60
    uint256 private constant FEE_DENOMINATOR = FEE_BASE * FEE_PERIOD;
    int128 private _hwm64x64; // should be a float point number
    int128 private _lastGrossSharePrice64x64;
    uint256 private _feeSum;
    uint256 private _lastOutstandingShare;
    uint256 private _crystallizationPeriod;
    uint256 private _lastCrystallization;

    function _setPerformanceFeeRate(uint256 feeRate)
        internal
        virtual
        returns (int128)
    {
        _feeRate64x64 = feeRate.divu(FEE_BASE);

        return _feeRate64x64;
    }

    function _setCrystallizationPeriod(uint256 period) internal virtual {
        _crystallizationPeriod = period;
    }

    function crystallize() public virtual {
        require(
            block.timestamp > _lastCrystallization + _crystallizationPeriod,
            "Not yet"
        );
        IShareToken shareToken = __getShareToken();
        address manager = __getManager();
        shareToken.move(address(0), manager, _lastOutstandingShare);
        _lastOutstandingShare = 0;
        _feeSum = 0;
        _lastCrystallization = block.timestamp;
    }

    function _updatePerformanceFee() internal virtual {
        IShareToken shareToken = __getShareToken();
        // Get accumulated wealth
        uint256 grossAssetValue = __getGrossAssetValue();
        uint256 totalShare = shareToken.grossTotalShare();
        int128 grossSharePrice64x64 = grossAssetValue.divu(totalShare);
        int256 wealth = LibFee
            ._max64x64(_hwm64x64, grossSharePrice64x64)
            .sub(LibFee._max64x64(_hwm64x64, _lastGrossSharePrice64x64))
            .muli(int256(totalShare));
        int256 fee = _feeRate64x64.muli(wealth);
        _feeSum = uint256(LibFee._max(0, int256(_feeSum) + fee));
        uint256 netAssetValue = grossAssetValue - _feeSum;
        uint256 outstandingShare = (totalShare * _feeSum) / netAssetValue;
        if (outstandingShare > _lastOutstandingShare) {
            shareToken.mint(
                address(0),
                outstandingShare - _lastOutstandingShare
            );
        } else {
            shareToken.burn(
                address(0),
                _lastOutstandingShare - outstandingShare
            );
        }
        _lastOutstandingShare = outstandingShare;
        _lastGrossSharePrice64x64 = grossAssetValue.divu(
            totalShare + outstandingShare
        );
    }

    function _updateGrossSharePrice() internal virtual {
        IShareToken shareToken = __getShareToken();
        uint256 grossAssetValue = __getGrossAssetValue();
        uint256 totalShare = shareToken.grossTotalShare();
        _lastGrossSharePrice64x64 = grossAssetValue.divu(totalShare);
    }

    function _redemptionPayout(uint256 amount) internal virtual {
        IShareToken shareToken = __getShareToken();
        address manager = __getManager();
        uint256 totalShare = shareToken.grossTotalShare();
        uint256 payout = (_lastOutstandingShare * amount) / totalShare;
        uint256 fee = (_feeSum * amount) / totalShare;
        shareToken.move(address(0), manager, payout);
        _lastOutstandingShare -= payout;
        _feeSum -= fee;
    }

    function __getShareToken() internal view virtual returns (IShareToken);

    function __getGrossAssetValue() internal view virtual returns (uint256);

    function __getManager() internal virtual returns (address);
}
