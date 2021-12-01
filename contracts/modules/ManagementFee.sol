// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

abstract contract ManagementFee {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    int128 private _feeRate64x64;
    uint256 private constant FEE_BASE = 10000;
    int128 private constant FEE_BASE64x64 = 0x100000000;
    uint256 private constant FEE_PERIOD = 31557600; // 365.25*24*60*60
    uint256 public lastMFeeClaimTime;

    function _setManagementFeeRate(uint256 feeRate)
        internal
        virtual
        returns (int128)
    {
        return _setManagementFeeRate(feeRate.divu(FEE_BASE));
    }

    function _setManagementFeeRate(int128 feeRate64x64)
        private
        returns (int128)
    {
        _feeRate64x64 = (uint256(1).fromUInt().sub(feeRate64x64))
            .ln()
            .neg()
            .div(FEE_PERIOD.fromUInt())
            .exp();

        return _feeRate64x64;
    }

    function claimManagementFee() public virtual returns (uint256) {
        return _updateManagementFee();
    }

    function getManagementFeeRate() public view returns (uint256 feeRate) {
        return _feeRate64x64.toUInt();
    }

    function getExpectFeeRate(uint256 feeRate) public pure returns (int128) {
        return feeRate.fromUInt();
    }

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

    function __getShareToken() internal view virtual returns (IShareToken);

    function __getManager() internal virtual returns (address);
}
