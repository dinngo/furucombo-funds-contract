// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IShareERC20} from "../interfaces/IShareERC20.sol";

abstract contract ManagementFee {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;

    int128 private _feeRate64x64;
    int128 private constant FEE_BASE = 0x100000000;
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
        _feeRate64x64 = _getExpectFeeRate(feeRate);

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
        IShareERC20 shareToken = __getShareToken();
        uint256 currentTime = block.timestamp;
        uint256 totalShare = shareToken.totalSupply();
        uint256 sharesDue = (
            _feeRate64x64.pow(currentTime - _lastMFeeClaimTime).sub(FEE_BASE)
        ).mulu(totalShare);

        address receiver = __getManager();
        shareToken.mint(receiver, sharesDue);
        _lastMFeeClaimTime = currentTime;

        return sharesDue;
    }

    function __getShareToken() internal view virtual returns (IShareERC20);

    function __getManager() internal virtual returns (address);

    function __getNetAssetValue() internal view virtual returns (uint256);

    function __getGrossAssetValue() internal view virtual returns (uint256);
}
