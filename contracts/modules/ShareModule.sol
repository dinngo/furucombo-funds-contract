// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetModule} from "./AssetModule.sol";
import {PoolState} from "../PoolState.sol";

/// @title Share module
abstract contract ShareModule is PoolState {
    using ABDKMath64x64 for uint256;
    using ABDKMath64x64 for int128;
    using SafeERC20 for IERC20;

    mapping(address => uint256) public pendingShares;
    address[] public pendingAccountList;
    mapping(address => uint256) public pendingRedemptions;
    uint256 public totalPendingShare;
    uint256 public totalPendingBonus;
    uint256 private constant _PENALTY_BASE = 1e4;

    event Purchased(
        address indexed user,
        uint256 assetAmount,
        uint256 shareAmount
    );
    event Redeemed(
        address indexed user,
        uint256 assetAmount,
        uint256 shareAmount
    );
    event RedemptionPended(address indexed user, uint256 shareAmount);
    event RedemptionClaimed(address indexed user, uint256 assetAmount);

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
        when3States(State.Executing, State.RedemptionPending, State.Closed)
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

    function _settlePendingRedemption(bool applyPenalty)
        internal
        returns (bool)
    {
        if (totalPendingShare == 0) return false;

        // Might lead to gas insufficient if pending list too long
        uint256 redeemAmount;
        if (applyPenalty) {
            redeemAmount = totalPendingShare;
        } else {
            redeemAmount = totalPendingShare + totalPendingBonus;
            totalPendingBonus = 0;
        }
        uint256 totalRedemption = _redeem(address(this), redeemAmount);
        while (pendingAccountList.length > 0) {
            address user = pendingAccountList[pendingAccountList.length - 1];
            uint256 share = pendingShares[user];
            uint256 redemption = (totalRedemption * share) / totalPendingShare;
            pendingRedemptions[user] += redemption;
            pendingAccountList.pop();
        }

        totalPendingShare = 0;
        if (totalPendingBonus != 0) {
            uint256 unusedBonus = totalPendingBonus;
            totalPendingBonus = 0;
            shareToken.burn(address(this), unusedBonus);
        }

        return true;
    }

    /// @notice Claim the settled pending redemption.
    /// @return balance The balance being claimed.
    function claimPendingRedemption() public virtual returns (uint256 balance) {
        balance = pendingRedemptions[msg.sender];
        denomination.safeTransfer(msg.sender, balance);
        emit RedemptionClaimed(msg.sender, balance);
    }

    function _purchase(address user, uint256 balance)
        internal
        virtual
        returns (uint256 share)
    {
        _callBeforePurchase(0);
        share = _addShare(user, balance);
        uint256 penalty = _getPendingRedemptionPenalty();
        if (state == State.RedemptionPending) {
            uint256 bonus = (share * (penalty)) / (_PENALTY_BASE - penalty);
            bonus = totalPendingBonus > bonus ? bonus : totalPendingBonus;
            totalPendingBonus -= bonus;
            shareToken.move(address(this), user, bonus);
            share += bonus;
        }
        denomination.safeTransferFrom(msg.sender, address(vault), balance);
        _callAfterPurchase(share);
        emit Purchased(user, balance, share);
    }

    function _redeem(address user, uint256 share)
        internal
        virtual
        returns (uint256)
    {
        _callBeforeRedeem(share);
        (uint256 shareLeft, uint256 balance) = _removeShare(user, share);
        if (shareLeft != 0) {
            _pend();
            _redeemPending(user, shareLeft);
        }
        uint256 shareRedeemed = share - shareLeft;
        denomination.safeTransferFrom(address(vault), user, balance);
        _callAfterRedeem(shareRedeemed);
        emit Redeemed(user, balance, shareRedeemed);

        return balance;
    }

    function _redeemPending(address user, uint256 share)
        internal
        virtual
        returns (uint256)
    {
        uint256 penalty = _getPendingRedemptionPenalty();
        uint256 effectiveShare = (share * (_PENALTY_BASE - penalty)) /
            _PENALTY_BASE;
        if (pendingShares[user] == 0) pendingAccountList.push(user);
        pendingShares[user] += effectiveShare;
        totalPendingShare += effectiveShare;
        totalPendingBonus += (share - effectiveShare);
        shareToken.move(user, address(this), share);
        emit RedemptionPended(user, share);

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

    function _getPendingRedemptionPenalty()
        internal
        view
        virtual
        returns (uint256)
    {
        return comptroller.pendingRedemptionPenalty();
    }

    function __getTotalAssetValue() internal view virtual returns (uint256);

    function __getReserve() internal view virtual returns (uint256);
}
