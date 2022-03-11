// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {ManagementFeeModule} from "../modules/ManagementFeeModule.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

contract ManagementFeeModuleMock is ManagementFeeModule {
    using ABDKMath64x64 for uint256;

    address public manager;

    function setShareToken(IShareToken shareToken_) public {
        shareToken = shareToken_;
    }

    function setManager(address manager_) public {
        manager = manager_;
    }

    function setManagementFeeRate(uint256 feeRate) external returns (int256) {
        lastMFeeClaimTime = block.timestamp;
        return _setManagementFeeRate(feeRate);
    }

    function initializeManagementFee() public {
        _initializeManagementFee();
    }

    function getManager() public view override returns (address) {
        return manager;
    }

    function getFeeBase() public pure returns (uint256) {
        return 1e4;
    }

    function getRateBase() public pure returns (int128) {
        return uint256(1).fromUInt();
    }

    function getFeePeriod() public pure returns (uint256) {
        return 31557600;
    }

    function mintShareToken(address user, uint256 share) public {
        _updateManagementFee();
        shareToken.mint(user, share);
    }
}
