// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {Errors} from "../utils/Errors.sol";

/// @title Share module
abstract contract ShareModule is FundProxyStorageUtils {
    using ABDKMath64x64 for uint256;
    using ABDKMath64x64 for int128;
    using SafeERC20 for IERC20;

    event Purchased(address indexed user, uint256 assetAmount, uint256 shareAmount, uint256 bonusAmount);
    event Redeemed(address indexed user, uint256 assetAmount, uint256 shareAmount);
    event RedemptionPended(address indexed user, uint256 shareAmount, uint256 penaltyAmount);
    event RedemptionPendingSettled();
    event RedemptionClaimed(address indexed user, uint256 assetAmount);

    /// @notice the length of pendingRoundList, means current pending round
    /// @return current pending round
    function currentPendingRound() public view returns (uint256) {
        return pendingRoundList.length;
    }

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

    /// @notice Redeem with the given share amount. Need to wait when fund is under liquidation
    function redeem(uint256 share, bool acceptPending)
        public
        virtual
        when3States(State.Executing, State.RedemptionPending, State.Closed)
        returns (uint256 balance)
    {
        // Check redeem shares need to greater than user shares they own
        uint256 userShare = shareToken.balanceOf(msg.sender);
        Errors._require(share <= userShare, Errors.Code.SHARE_MODULE_INSUFFICIENT_SHARES);

        // Claim pending redemption if need
        if (isPendingRedemptionClaimable(msg.sender)) {
            _claimPendingRedemption(msg.sender);
        }

        // Execute redeem operation
        if (state == State.RedemptionPending) {
            balance = _redeemPending(msg.sender, share, acceptPending);
        } else {
            balance = _redeem(msg.sender, share, acceptPending);
        }
    }

    /// @notice Calculate the share amount corresponding to the given balance.
    /// @param balance The balance to be queried.
    /// @return share The share amount.
    function calculateShare(uint256 balance) public view virtual returns (uint256 share) {
        uint256 shareAmount = shareToken.grossTotalShare();
        if (shareAmount == 0) {
            // Handler initial minting
            share = balance;
        } else {
            uint256 assetValue = getTotalAssetValue();
            share = (shareAmount * balance) / assetValue;
        }
    }

    /// @notice Calculate the balance amount corresponding to the given share
    /// amount.
    /// @param share The share amount to be queried.
    /// @return balance The balance.
    function calculateBalance(uint256 share) public view virtual returns (uint256 balance) {
        uint256 assetValue = getTotalAssetValue();
        uint256 shareAmount = shareToken.grossTotalShare();
        balance = (share * assetValue) / shareAmount;
    }

    /// @notice Determine user could claim pending redemption or not
    /// @param user address could be claimable
    /// @return true if claimable otherwise false
    function isPendingRedemptionClaimable(address user) public view returns (bool) {
        return pendingUsers[user].pendingRound < currentPendingRound() && pendingUsers[user].pendingShares > 0;
    }

    /// @notice Claim the settled pending redemption.
    /// @param user address want to be claim
    /// @return balance The balance being claimed.
    function claimPendingRedemption(address user) public virtual returns (uint256 balance) {
        Errors._require(isPendingRedemptionClaimable(user), Errors.Code.SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE);
        balance = _claimPendingRedemption(user);
    }

    /// @notice determine pending statue could be resolvable or not
    /// @param applyPenalty true if enable penalty otherwise false
    /// @return true if resolvable otherwise false
    function isPendingResolvable(bool applyPenalty) public view returns (bool) {
        uint256 redeemShares = _getResolvePendingShares(applyPenalty);
        uint256 redeemSharesBalance = calculateBalance(redeemShares);
        uint256 reserve = __getReserve();

        return reserve >= redeemSharesBalance;
    }

    /// @notice Calculate the max redeemable balance of the given share amount.
    /// @param share The share amount to be queried.
    /// @return shareLeft The share amount left due to insufficient reserve.
    /// @return balance The max redeemable balance from reserve.
    function calculateRedeemableBalance(uint256 share)
        public
        view
        virtual
        returns (uint256 shareLeft, uint256 balance)
    {
        balance = calculateBalance(share);
        uint256 reserve = __getReserve();

        // insufficient reserve
        if (balance > reserve) {
            uint256 shareToBurn = calculateShare(reserve);
            shareLeft = share - shareToBurn;
            balance = reserve;
        }
    }

    function _settlePendingRedemption(bool applyPenalty) internal {
        // Get total shares for the settle
        uint256 redeemShares = _getResolvePendingShares(applyPenalty);

        if (redeemShares > 0) {
            // Calculate the total redemptions depending on the redeemShares
            uint256 totalRedemption = _redeem(address(this), redeemShares, false);

            // Settle this round and store settle info to round list
            pendingRoundList.push(
                PendingRoundInfo({totalPendingShare: currentTotalPendingShare, totalRedemption: totalRedemption})
            );

            currentTotalPendingShare = 0; // reset currentTotalPendingShare
            if (applyPenalty) {
                // if applyPenalty is true that means there are some share as bonus shares，
                // need to burn these bonus shares if they are remaining
                if (currentTotalPendingBonus != 0) {
                    shareToken.burn(address(this), currentTotalPendingBonus); // burn unused bonus
                    currentTotalPendingBonus = 0;
                }
            } else {
                currentTotalPendingBonus = 0;
            }

            emit RedemptionPendingSettled();
        }
    }

    function _getResolvePendingShares(bool applyPenalty) internal view returns (uint256) {
        if (applyPenalty) {
            return currentTotalPendingShare;
        } else {
            return currentTotalPendingShare + currentTotalPendingBonus;
        }
    }

    function _purchase(address user, uint256 balance) internal virtual returns (uint256 share) {
        _callBeforePurchase(0);
        share = _addShare(user, balance);

        uint256 penalty = _getPendingRedemptionPenalty();
        uint256 bonus;
        if (state == State.RedemptionPending) {
            bonus = (share * (penalty)) / (_PENALTY_BASE - penalty);
            bonus = currentTotalPendingBonus > bonus ? bonus : currentTotalPendingBonus;
            currentTotalPendingBonus -= bonus;
            shareToken.move(address(this), user, bonus);
            share += bonus;
        }

        denomination.safeTransferFrom(msg.sender, address(vault), balance);

        _callAfterPurchase(share);

        emit Purchased(user, balance, share, bonus);
    }

    function _redeem(
        address user,
        uint256 share,
        bool acceptPending
    ) internal virtual returns (uint256) {
        _callBeforeRedeem(share);
        (uint256 shareLeft, uint256 balance) = calculateRedeemableBalance(share);

        uint256 shareRedeemed = share - shareLeft;
        shareToken.burn(user, shareRedeemed);

        if (shareLeft != 0) {
            _pend();
            _redeemPending(user, shareLeft, acceptPending);
        }

        denomination.safeTransferFrom(address(vault), user, balance);
        _callAfterRedeem(shareRedeemed);
        emit Redeemed(user, balance, shareRedeemed);

        return balance;
    }

    function _redeemPending(
        address user,
        uint256 share,
        bool acceptPending
    ) internal virtual returns (uint256) {
        Errors._require(acceptPending, Errors.Code.SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION);

        // Add the current pending round to pending user info for the first redeem
        if (pendingUsers[user].pendingShares == 0) {
            pendingUsers[user].pendingRound = currentPendingRound();
        } else {
            // Confirm user pending shares is in the current pending round
            Errors._require(
                pendingUsers[user].pendingRound == currentPendingRound(),
                Errors.Code.SHARE_MODULE_PENDING_ROUND_INCONSISTENT
            );
        }

        // Calculate and update pending information
        uint256 penalty = _getPendingRedemptionPenalty();
        uint256 effectiveShare = (share * (_PENALTY_BASE - penalty)) / _PENALTY_BASE;
        uint256 penaltyShare = share - effectiveShare;
        pendingUsers[user].pendingShares += effectiveShare;
        currentTotalPendingShare += effectiveShare;
        currentTotalPendingBonus += penaltyShare;
        shareToken.move(user, address(this), share);
        emit RedemptionPended(user, effectiveShare, penaltyShare);

        return 0;
    }

    function _addShare(address user, uint256 balance) internal virtual returns (uint256 share) {
        share = calculateShare(balance);
        shareToken.mint(user, share);
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

    function getTotalAssetValue() public view virtual returns (uint256);

    function _getPendingRedemptionPenalty() internal view virtual returns (uint256) {
        return comptroller.pendingRedemptionPenalty();
    }

    function _calcPendingRedemption(address user) internal view returns (uint256) {
        PendingUserInfo storage pendingUser = pendingUsers[user];
        PendingRoundInfo storage pendingRoundInfo = pendingRoundList[pendingUser.pendingRound];
        return (pendingRoundInfo.totalRedemption * pendingUser.pendingShares) / pendingRoundInfo.totalPendingShare;
    }

    function _claimPendingRedemption(address user) internal returns (uint256 balance) {
        balance = _calcPendingRedemption(user);

        // reset pending user to zero value
        delete pendingUsers[user];

        if (balance > 0) {
            denomination.safeTransfer(user, balance);
        }
        emit RedemptionClaimed(user, balance);
    }

    function __getReserve() internal view virtual returns (uint256);
}
