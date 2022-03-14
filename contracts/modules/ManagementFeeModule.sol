// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {PoolProxyStorageUtils} from "../PoolProxyStorageUtils.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

/// @title Management fee module
abstract contract ManagementFeeModule is PoolProxyStorageUtils {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    uint256 private constant _FEE_BASE = 1e4;
    int128 private constant _FEE_BASE64x64 = 1 << 64;
    uint256 public constant FEE_PERIOD = 31557600; // 365.25*24*60*60

    event ManagementFeeClaimed(address indexed manager, uint256 shareAmount);

    /// @notice Initial the management fee claim time.
    function _initializeManagementFee() internal virtual {
        lastMFeeClaimTime = block.timestamp;
    }

    /// @notice Set the management fee in a yearly basis.
    /// @param feeRate The fee rate in a 1e4 base.
    function _setManagementFeeRate(uint256 feeRate)
        internal
        virtual
        returns (int128)
    {
        // TODO: replace err msg: fee rate should be less than 100%
        require(feeRate < _FEE_BASE, "f");
        return _setManagementFeeRate(feeRate.divu(_FEE_BASE));
    }

    /// @dev Calculate the effective fee rate to achieve the fee rate in an
    /// exponential model.
    function _setManagementFeeRate(int128 feeRate64x64)
        private
        returns (int128)
    {
        _mFeeRate64x64 = uint256(1)
            .fromUInt()
            .sub(feeRate64x64)
            .ln()
            .neg()
            .div(FEE_PERIOD.fromUInt())
            .exp();

        return _mFeeRate64x64;
    }

    /// @notice Claim the accumulated management fee.
    /// @return The fee amount being claimed.
    function claimManagementFee() public virtual returns (uint256) {
        return _updateManagementFee();
    }

    /// @notice Get the calculated effective fee rate.
    function getManagementFeeRate() public view returns (int128 feeRate) {
        return _mFeeRate64x64;
    }

    /// @notice Update the current management fee and mint to the manager right
    /// away. Update the claim time as the basis of the accumulation afterward
    /// also.
    /// @return The share being minted this time.
    function _updateManagementFee() internal virtual returns (uint256) {
        uint256 currentTime = block.timestamp;
        uint256 totalShare = shareToken.grossTotalShare();

        uint256 sharesDue = (
            _mFeeRate64x64.pow(currentTime - lastMFeeClaimTime).sub(
                _FEE_BASE64x64
            )
        ).mulu(totalShare);

        address manager = getManager();
        shareToken.mint(manager, sharesDue);
        lastMFeeClaimTime = currentTime;
        emit ManagementFeeClaimed(manager, sharesDue);

        return sharesDue;
    }

    /// @notice Get the manager address.
    function getManager() public virtual returns (address);
}
