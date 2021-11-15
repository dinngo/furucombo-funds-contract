// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetModule} from "./AssetModule.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract ShareModule is ModuleBase {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public pendingShares;
    address[] public pendingAccountList;
    mapping(address => uint256) public pendingRedemptions;
    uint256 public totalPendingShare;
    uint256 public pendingStartTime;

    function purchase(uint256 balance)
        external
        whenStates(State.Executing, State.RedemptionPending)
        returns (uint256 share)
    {
        share = _purchase(msg.sender, balance);
    }

    function redeem(uint256 share)
        external
        whenNotState(State.Liquidating)
        returns (uint256 balance)
    {
        if (state == State.Executing) {
            balance = _redeem(msg.sender, share);
        } else {
            balance = _redeemPending(msg.sender, share);
        }
    }

    function calculateShare(uint256 balance)
        public
        view
        returns (uint256 share)
    {
        uint256 shareAmount = shareToken.totalSupply();
        if (shareAmount == 0) {
            // Handler initial minting
            share = balance;
        } else {
            uint256 assetValue = getAssetValue();
            share = (shareAmount * balance) / assetValue;
        }
    }

    function calculateBalance(uint256 share)
        public
        view
        returns (uint256 balance)
    {
        uint256 assetValue = getAssetValue();
        uint256 shareAmount = shareToken.totalSupply();
        balance = (share * assetValue) / shareAmount;
    }

    function settlePendingRedemption() external returns (bool) {
        // Might lead to gas insufficient if pending list too long
        uint256 totalRedemption = _redeem(address(this), totalPendingShare);
        while (pendingAccountList.length > 0) {
            address user = pendingAccountList[pendingAccountList.length - 1];
            uint256 share = pendingShares[user];
            uint256 redemption = (totalRedemption * share) / totalPendingShare;
            pendingRedemptions[user] += redemption;
            pendingAccountList.pop();
        }

        totalPendingShare = 0;
        _enterState(State.Executing);
        pendingStartTime = 0;

        return true;
    }

    function claimPendingRedemption() external returns (uint256 balance) {
        balance = pendingRedemptions[msg.sender];
        denomination.safeTransfer(msg.sender, balance);
    }

    function getAssetValue() public view virtual returns (uint256);

    function getReserve() public view virtual returns (uint256);

    function _purchase(address user, uint256 balance)
        internal
        returns (uint256 share)
    {
        _callBeforePurchase();
        share = _addShare(user, balance);
        denomination.safeTransferFrom(msg.sender, address(vault), balance);
        _callAfterPurchase();
    }

    function _redeem(address user, uint256 share) internal returns (uint256) {
        _callBeforeRedeem();
        (uint256 shareLeft, uint256 balance) = _removeShare(user, share);
        denomination.safeTransferFrom(address(vault), user, balance);
        if (shareLeft != 0) {
            _enterState(State.RedemptionPending);
            pendingStartTime = block.timestamp;
            _redeemPending(user, shareLeft);
        }
        _callAfterRedeem();

        return balance;
    }

    function _redeemPending(address user, uint256 share)
        internal
        returns (uint256)
    {
        if (pendingShares[user] == 0) pendingAccountList.push(user);
        pendingShares[user] += share;
        totalPendingShare += share;
        shareToken.move(user, address(this), share);

        return 0;
    }

    function _addShare(address user, uint256 balance)
        internal
        returns (uint256 share)
    {
        share = calculateShare(balance);
        shareToken.mint(user, share);
    }

    function _removeShare(address user, uint256 share)
        internal
        returns (uint256 shareLeft, uint256 balance)
    {
        balance = calculateBalance(share);
        uint256 reserve = getReserve();
        if (balance > reserve) {
            uint256 shareToBurn = calculateShare(reserve);
            shareLeft = share - shareToBurn;
            balance = reserve;
            shareToken.burn(user, shareToBurn);
        } else {
            shareLeft = 0;
            shareToken.burn(user, share);
        }
    }

    function _callBeforePurchase() internal virtual {
        return;
    }

    function _callAfterPurchase() internal virtual {
        return;
    }

    function _callBeforeRedeem() internal virtual {
        return;
    }

    function _callAfterRedeem() internal virtual {
        return;
    }
}
