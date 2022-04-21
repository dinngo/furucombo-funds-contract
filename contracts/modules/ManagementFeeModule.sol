// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {Errors} from "../utils/Errors.sol";

/// @title Management fee module
abstract contract ManagementFeeModule is FundProxyStorageUtils {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    int128 private constant _FEE_BASE64x64 = 1 << 64;
    uint256 private constant _FEE_PERIOD = 31557600; // 365.25*24*60*60

    event ManagementFeeClaimed(address indexed manager, uint256 shareAmount);

    /// @notice Claim the accumulated management fee.
    /// @return The fee amount being claimed.
    function claimManagementFee() external virtual nonReentrant returns (uint256) {
        return _updateManagementFee();
    }

    /// @notice Initial the management fee claim time.
    function _initializeManagementFee() internal virtual {
        lastMFeeClaimTime = block.timestamp;
    }

    /// @notice Set the management fee in a yearly basis.
    /// @param feeRate_ The fee rate in a 1e4 base.
    function _setManagementFeeRate(uint256 feeRate_) internal virtual returns (int128) {
        Errors._require(
            feeRate_ < _FUND_PERCENTAGE_BASE,
            Errors.Code.MANAGEMENT_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_FUND_BASE
        );
        return _setManagementFeeRate(feeRate_.divu(_FUND_PERCENTAGE_BASE));
    }

    /// @dev Calculate the effective fee rate to achieve the fee rate in an
    /// exponential model.
    function _setManagementFeeRate(int128 feeRate64x64_) internal returns (int128) {
        mFeeRate64x64 = uint256(1).fromUInt().sub(feeRate64x64_).ln().neg().div(_FEE_PERIOD.fromUInt()).exp();

        return mFeeRate64x64;
    }

    /// @notice Update the current management fee and mint to the manager right
    /// away. Update the claim time as the basis of the accumulation afterward
    /// also.
    /// @return The share being minted this time.
    function _updateManagementFee() internal virtual returns (uint256) {
        uint256 currentTime = block.timestamp;
        uint256 totalShare = shareToken.grossTotalShare();

        uint256 shareDue = (mFeeRate64x64.pow(currentTime - lastMFeeClaimTime).sub(_FEE_BASE64x64)).mulu(totalShare);

        address manager = owner();
        shareToken.mint(manager, shareDue);
        lastMFeeClaimTime = currentTime;
        emit ManagementFeeClaimed(manager, shareDue);

        return shareDue;
    }
}
