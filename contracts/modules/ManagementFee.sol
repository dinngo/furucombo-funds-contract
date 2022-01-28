// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

/// @title Management fee implementation
abstract contract ManagementFee {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    int128 private _feeRate64x64;
    uint256 public constant FEE_BASE = 1e4;
    int128 public constant FEE_BASE64x64 = 1 << 64;
    uint256 public constant FEE_PERIOD = 31557600; // 365.25*24*60*60
    uint256 public lastMFeeClaimTime;

    /// @notice Set the management fee in a yearly basis.
    /// @param feeRate The fee rate in a 1e4 base.
    function _setManagementFeeRate(uint256 feeRate)
        internal
        virtual
        returns (int128)
    {
        return _setManagementFeeRate(feeRate.divu(FEE_BASE));
    }

    /// @dev Calculate the effective fee rate to achieve the fee rate in an
    /// exponential model.
    function _setManagementFeeRate(int128 feeRate64x64)
        private
        returns (int128)
    {
        _feeRate64x64 = uint256(1)
            .fromUInt()
            .sub(feeRate64x64)
            .ln()
            .neg()
            .div(FEE_PERIOD.fromUInt())
            .exp();

        return _feeRate64x64;
    }

    /// @notice Claim the accumulated management fee.
    /// @return The fee amount being claimed.
    function claimManagementFee() public virtual returns (uint256) {
        return _updateManagementFee();
    }

    /// @notice Get the calculated effective fee rate.
    function getManagementFeeRate() public view returns (int128 feeRate) {
        return _feeRate64x64;
    }

    /// @notice Update the current management fee and mint to the manager right
    /// away. Update the claim time as the basis of the accumulation afterward
    /// also.
    /// @return The share being minted this time.
    function _updateManagementFee() internal virtual returns (uint256) {
        IShareToken shareToken = __getShareToken();
        uint256 currentTime = block.timestamp;
        uint256 totalShare = shareToken.grossTotalShare();

        uint256 sharesDue = (
            _feeRate64x64.pow(currentTime - lastMFeeClaimTime).sub(
                FEE_BASE64x64
            )
        ).mulu(totalShare);

        address receiver = __getManager();
        shareToken.mint(receiver, sharesDue);
        lastMFeeClaimTime = currentTime;

        return sharesDue;
    }

    /// @notice Get the share token.
    function __getShareToken() internal view virtual returns (IShareToken);

    /// @notice Get the manager address.
    function __getManager() internal virtual returns (address);
}
