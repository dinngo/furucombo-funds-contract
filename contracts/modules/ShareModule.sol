// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetModule} from "./AssetModule.sol";
import {PoolState} from "../PoolState.sol";

/// @title Share module
abstract contract ShareModule is PoolState {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public pendingShares;
    address[] public pendingAccountList;
    mapping(address => uint256) public pendingRedemptions;
    uint256 public totalPendingShare;
    uint256 public pendingStartTime;

    event Purchased(uint256 assetAmount, uint256 shareAmount);
    event Redeemed(uint256 assetAmount, uint256 shareAmount);
    event RedemptionPended(uint256 shareAmount);
    event RedemptionClaimed(uint256 assetAmount);

    /// @notice Purchase share with the given balance. Can only purchase at Executing and Redemption Pending state.
    /// @return share The share amount being purchased.
    function purchase(uint256 balance)
        public
        virtual
        whenStates(State.Executing, State.RedemptionPending)
        returns (uint256 share)
    {
        share = _purchase(msg.sender, balance);
    }

    /// @notice Redeem with the given share amount. Can only redeem when pool
    /// is not under liquidation.
    function redeem(uint256 share)
        public
        virtual
        whenNotState(State.Liquidating)
        returns (uint256 balance)
    {
        if (state == State.RedemptionPending) {
            balance = _redeemPending(msg.sender, share);
        } else {
            balance = _redeem(msg.sender, share);
        }
    }

    /// @notice Calculate the share amount corresponding to the given balance.
    /// @param balance The balance to be queried.
    /// @return share The share amount.
    function calculateShare(uint256 balance)
        public
        view
        virtual
        returns (uint256 share)
    {
        uint256 shareAmount = shareToken.grossTotalShare();
        if (shareAmount == 0) {
            // Handler initial minting
            share = balance;
        } else {
            uint256 assetValue = __getTotalAssetValue();
            share = (shareAmount * balance) / assetValue;
        }
    }

    /// @notice Calculate the balance amount corresponding to the given share
    /// amount.
    /// @param share The share amount to be queried.
    /// @return balance The balance.
    function calculateBalance(uint256 share)
        public
        view
        virtual
        returns (uint256 balance)
    {
        uint256 assetValue = __getTotalAssetValue();
        uint256 shareAmount = shareToken.totalSupply();
        balance = (share * assetValue) / shareAmount;
    }

    /// @notice Settle the pending redemption and assign the proper balance to
    /// each user.
    function settlePendingRedemption() public virtual returns (bool) {
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

    /// @notice Claim the settled pending redemption.
    /// @return balance The balance being claimed.
    function claimPendingRedemption() public virtual returns (uint256 balance) {
        balance = pendingRedemptions[msg.sender];
        denomination.safeTransfer(msg.sender, balance);
        emit RedemptionClaimed(balance);
    }

    function _purchase(address user, uint256 balance)
        internal
        virtual
        returns (uint256 share)
    {
        _callBeforePurchase(0);
        share = _addShare(user, balance);
        denomination.safeTransferFrom(msg.sender, address(vault), balance);
        _callAfterPurchase(share);
        emit Purchased(balance, share);
    }

    function _redeem(address user, uint256 share)
        internal
        virtual
        returns (uint256)
    {
        _callBeforeRedeem(share);
        (uint256 shareLeft, uint256 balance) = _removeShare(user, share);
        denomination.safeTransferFrom(address(vault), user, balance);
        if (shareLeft != 0) {
            require(state == State.Executing, "Can only left while Executing");
            _enterState(State.RedemptionPending);
            pendingStartTime = block.timestamp;
            _redeemPending(user, shareLeft);
        }
        uint256 shareRedeemed = share - shareLeft;
        _callAfterRedeem(shareRedeemed);
        emit Redeemed(balance, shareRedeemed);

        return balance;
    }

    function _redeemPending(address user, uint256 share)
        internal
        virtual
        returns (uint256)
    {
        if (pendingShares[user] == 0) pendingAccountList.push(user);
        pendingShares[user] += share;
        totalPendingShare += share;
        shareToken.move(user, address(this), share);
        emit RedemptionPended(share);

        return 0;
    }

    function _addShare(address user, uint256 balance)
        internal
        virtual
        returns (uint256 share)
    {
        share = calculateShare(balance);
        shareToken.mint(user, share);
    }

    function _removeShare(address user, uint256 share)
        internal
        virtual
        returns (uint256 shareLeft, uint256 balance)
    {
        balance = calculateBalance(share);
        uint256 reserve = __getReserve();
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

    function _callBeforePurchase(uint256 amount) internal virtual {
        amount;
        return;
    }

    function _callAfterPurchase(uint256 amount) internal virtual {
        amount;
        return;
    }

    function _callBeforeRedeem(uint256 amount) internal virtual {
        amount;
        return;
    }

    function _callAfterRedeem(uint256 amount) internal virtual {
        amount;
        return;
    }

    function __getTotalAssetValue() internal view virtual returns (uint256);

    function __getReserve() internal view virtual returns (uint256);
}
