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
    //uint256 private constant FEE_DENOMINATOR = FEE_BASE * FEE_PERIOD;
    uint256 private _lastMFeeClaimTime;

    function setEffectiveManagementFeeRate(int128 feeRate64x64)
        public
        returns (int128)
    {
        _feeRate64x64 = feeRate64x64;

        return _feeRate64x64;
    }

    function setManagementFeeRate(uint256 feeRate) public returns (int128) {
        return setManagementFeeRate(feeRate.divu(FEE_BASE));
    }

    function setManagementFeeRate(int128 feeRate64x64) public returns (int128) {
        int128 k = (uint256(1).fromUInt().sub(feeRate64x64))
            .ln()
            .neg()
            .div(FEE_PERIOD.fromUInt())
            .exp();
        _feeRate64x64 = k;

        return _feeRate64x64;
    }

    function claimManagementFee() external returns (uint256) {
        return _mintManagementFee();
    }

    function getManagementFeeRate() public view returns (uint256 feeRate) {
        return _feeRate64x64.toUInt();
    }

    function _getExpectFeeRate(uint256 feeRate) internal pure returns (int128) {
        return feeRate.fromUInt();
    }

    function _mintManagementFee() internal returns (uint256) {
        IShareToken shareToken = __getShareToken();
        uint256 currentTime = block.timestamp;
        uint256 totalShare = shareToken.grossTotalShare();
        uint256 sharesDue = (
            _feeRate64x64.pow(currentTime - _lastMFeeClaimTime).sub(
                FEE_BASE64x64
            )
        ).mulu(totalShare);

        address receiver = __getManager();
        shareToken.mint(receiver, sharesDue);
        _lastMFeeClaimTime = currentTime;

        return sharesDue;
    }

    function __getShareToken() internal view virtual returns (IShareToken);

    function __getManager() internal virtual returns (address);
}
