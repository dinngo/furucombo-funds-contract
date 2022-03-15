// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {LibFee} from "../libraries/LibFee.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";
import {PerformanceFeeModule} from "../modules/PerformanceFeeModule.sol";

contract PerformanceFeeModuleMock is PerformanceFeeModule {
    using ABDKMath64x64 for uint256;

    uint256 public grossAssetValue;
    address public manager;

    function setShareToken(IShareToken shareToken_) public {
        shareToken = shareToken_;
    }

    function setGrossAssetValue(uint256 grossAssetValue_) public {
        grossAssetValue = grossAssetValue_;
    }

    function setManager(address manager_) public {
        manager = manager_;
    }

    function mintShareToken(address user, uint256 share) public {
        _updatePerformanceFee();
        shareToken.mint(user, share);
        _updateGrossSharePrice();
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
        _updatePerformanceFee();
    }

    function updateGrossSharePrice() public {
        _updateGrossSharePrice();
    }

    function redemptionPayout(uint256 amount) public {
        _updatePerformanceFee();
        grossAssetValue =
            grossAssetValue -
            ((grossAssetValue * amount) / shareToken.grossTotalShare());
        shareToken.burn(msg.sender, amount);
        _redemptionPayout(amount);
        _updateGrossSharePrice();
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

    function getManager() public view override returns (address) {
        return manager;
    }

    function getTotalAssetValue() public view override returns (uint256) {
        return grossAssetValue;
    }
}