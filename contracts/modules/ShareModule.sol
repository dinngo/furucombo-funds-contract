// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FundProxyStorageUtils} from "../FundProxyStorageUtils.sol";
import {Errors} from "../utils/Errors.sol";

/// @title Share module
abstract contract ShareModule is FundProxyStorageUtils {
    using SafeERC20 for IERC20;

    uint256 private constant MINIMUM_SHARE = 1e3;

    event Purchased(address indexed user, uint256 assetAmount, uint256 shareAmount, uint256 bonusAmount);
    event Redeemed(address indexed user, uint256 assetAmount, uint256 shareAmount);
    event Pended(address indexed user, uint256 shareAmount, uint256 penaltyAmount);
    event PendingShareSettled();
    event RedemptionClaimed(address indexed user, uint256 assetAmount);

    /// @notice Calculate the share amount corresponding to the given balance.
    /// @param balance_ The balance to be queried.
    /// @return share The share amount.
    function calculateShare(uint256 balance_) external view returns (uint256 share) {
        uint256 grossAssetValue = __getGrossAssetValue();
        return _calculateShare(balance_, grossAssetValue);
    }

    function _calculateShare(uint256 balance_, uint256 grossAssetValue_) internal view virtual returns (uint256 share) {
        uint256 shareAmount = shareToken.grossTotalShare();
        if (shareAmount == 0) {
            // Handle initial purchase when balance_ > MINIMUM_SHARE, otherwise return share = 0
            if (balance_ > MINIMUM_SHARE) {
                share = balance_ - MINIMUM_SHARE;
            }
        } else {
            share = (shareAmount * balance_) / grossAssetValue_;
        }
    }

    /// @notice Calculate the balance amount corresponding to the given share
    /// amount.
    /// @param share_ The share amount to be queried.
    /// @return balance The balance.
    function calculateBalance(uint256 share_) external view returns (uint256 balance) {
        uint256 grossAssetValue = __getGrossAssetValue();
        balance = _calculateBalance(share_, grossAssetValue);
    }

    function _calculateBalance(uint256 share_, uint256 grossAssetValue_)
        internal
        view
        virtual
        returns (uint256 balance)
    {
        uint256 shareAmount = shareToken.grossTotalShare();
        Errors._require(share_ <= shareAmount, Errors.Code.SHARE_MODULE_SHARE_AMOUNT_TOO_LARGE);
        if (shareAmount == 0) {
            balance = 0;
        } else {
            balance = (share_ * grossAssetValue_) / shareAmount;
        }
    }

    /// @notice determine pending statue could be resolvable or not
    /// @param applyPenalty_ true if enable penalty otherwise false
    /// @return true if resolvable otherwise false
    function isPendingResolvable(bool applyPenalty_) external view returns (bool) {
        uint256 grossAssetValue = __getGrossAssetValue();

        return _isPendingResolvable(applyPenalty_, grossAssetValue);
    }

    function _isPendingResolvable(bool applyPenalty_, uint256 grossAssetValue_) internal view returns (bool) {
        uint256 redeemShare = _getResolvePendingShare(applyPenalty_);
        uint256 redeemShareBalance = _calculateBalance(redeemShare, grossAssetValue_);
        uint256 reserve = __getReserve();

        return reserve >= redeemShareBalance;
    }

    /// @notice Calculate the max redeemable balance of the given share amount.
    /// @param share_ The share amount to be queried.
    /// @return shareLeft The share amount left due to insufficient reserve.
    /// @return balance The max redeemable balance from reserve.
    function calculateRedeemableBalance(uint256 share_) external view returns (uint256 shareLeft, uint256 balance) {
        uint256 grossAssetValue = __getGrossAssetValue();
        return _calculateRedeemableBalance(share_, grossAssetValue);
    }

    function _calculateRedeemableBalance(uint256 share_, uint256 grossAssetValue_)
        internal
        view
        virtual
        returns (uint256 shareLeft, uint256 balance)
    {
        balance = _calculateBalance(share_, grossAssetValue_);
        uint256 reserve = __getReserve();

        // insufficient reserve
        if (balance > reserve) {
            uint256 shareToBurn = _calculateShare(reserve, grossAssetValue_);
            shareLeft = share_ - shareToBurn;
            balance = reserve;
        }
    }

    /// @notice Purchase share with the given balance. Can only purchase at Executing and Pending state.
    /// @return share The share amount being purchased.
    function purchase(uint256 balance_)
        external
        virtual
        whenStates(State.Executing, State.Pending)
        nonReentrant
        returns (uint256 share)
    {
        // Purchase balance need to greater than zero
        Errors._require(balance_ > 0, Errors.Code.SHARE_MODULE_PURCHASE_ZERO_BALANCE);

        share = _purchase(msg.sender, balance_);
    }

    function _purchase(address user_, uint256 balance_) internal virtual returns (uint256 share) {
        uint256 grossAssetValue = _beforePurchase();
        share = _addShare(user_, balance_, grossAssetValue);

        // Purchase share need to greater than zero
        Errors._require(share > 0, Errors.Code.SHARE_MODULE_PURCHASE_ZERO_SHARE);

        uint256 penalty = _getPendingPenalty();
        uint256 bonus;
        if (state == State.Pending) {
            bonus = (share * (penalty)) / (_FUND_PERCENTAGE_BASE - penalty);
            bonus = currentTotalPendingBonus > bonus ? bonus : currentTotalPendingBonus;
            currentTotalPendingBonus -= bonus;
            shareToken.move(address(this), user_, bonus);
            share += bonus;
        }
        grossAssetValue += balance_;
        denomination.safeTransferFrom(user_, address(vault), balance_);
        _afterPurchase(grossAssetValue);

        emit Purchased(user_, balance_, share, bonus);
    }

    /// @notice Redeem with the given share amount. Need to wait when fund is under liquidation
    function redeem(uint256 share_, bool acceptPending_)
        external
        virtual
        when3States(State.Executing, State.Pending, State.Closed)
        nonReentrant
        returns (uint256 balance)
    {
        // Redeem share need to greater than zero
        Errors._require(share_ > 0, Errors.Code.SHARE_MODULE_REDEEM_ZERO_SHARE);

        // Check redeem share need to greater than user share they own
        uint256 userShare = shareToken.balanceOf(msg.sender);
        Errors._require(share_ <= userShare, Errors.Code.SHARE_MODULE_INSUFFICIENT_SHARE);

        // Claim pending redemption if need
        if (isPendingRedemptionClaimable(msg.sender)) {
            _claimPendingRedemption(msg.sender);
        }

        // Execute redeem operation
        if (state == State.Pending) {
            balance = _redeemPending(msg.sender, share_, acceptPending_);
        } else {
            balance = _redeem(msg.sender, share_, acceptPending_);
        }
    }

    function _redeem(
        address user_,
        uint256 share_,
        bool acceptPending_
    ) internal virtual returns (uint256) {
        uint256 grossAssetValue = _beforeRedeem();
        (uint256 shareLeft, uint256 balance) = _calculateRedeemableBalance(share_, grossAssetValue);

        uint256 shareRedeemed = share_ - shareLeft;
        shareToken.burn(user_, shareRedeemed);

        if (shareLeft != 0) {
            _pend();
            _redeemPending(user_, shareLeft, acceptPending_);
        }
        grossAssetValue -= balance;
        denomination.safeTransferFrom(address(vault), user_, balance);
        _afterRedeem(grossAssetValue);
        emit Redeemed(user_, balance, shareRedeemed);

        return balance;
    }

    function _redeemPending(
        address user_,
        uint256 share_,
        bool acceptPending_
    ) internal virtual returns (uint256) {
        Errors._require(acceptPending_, Errors.Code.SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION);

        // Add the current pending round to pending user info for the first redeem
        if (pendingUsers[user_].pendingShare == 0) {
            pendingUsers[user_].pendingRound = currentPendingRound();
        } else {
            // Confirm user pending share is in the current pending round
            Errors._require(
                pendingUsers[user_].pendingRound == currentPendingRound(),
                Errors.Code.SHARE_MODULE_PENDING_ROUND_INCONSISTENT
            );
        }

        // Calculate and update pending information
        uint256 penalty = _getPendingPenalty();
        uint256 effectiveShare = (share_ * (_FUND_PERCENTAGE_BASE - penalty)) / _FUND_PERCENTAGE_BASE;
        uint256 penaltyShare = share_ - effectiveShare;
        pendingUsers[user_].pendingShare += effectiveShare;
        currentTotalPendingShare += effectiveShare;
        currentTotalPendingBonus += penaltyShare;
        shareToken.move(user_, address(this), share_);
        emit Pended(user_, effectiveShare, penaltyShare);

        return 0;
    }

    /// @notice Claim the settled pending redemption.
    /// @param user_ address want to be claim
    /// @return balance The balance being claimed.
    function claimPendingRedemption(address user_) external nonReentrant returns (uint256 balance) {
        Errors._require(isPendingRedemptionClaimable(user_), Errors.Code.SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE);
        balance = _claimPendingRedemption(user_);
    }

    function _claimPendingRedemption(address user_) internal returns (uint256 balance) {
        balance = _calcPendingRedemption(user_);

        // reset pending user to zero value
        delete pendingUsers[user_];

        if (balance > 0) {
            denomination.safeTransfer(user_, balance);
        }
        emit RedemptionClaimed(user_, balance);
    }

    /// @notice the length of pendingRoundList, means current pending round
    /// @return current pending round
    function currentPendingRound() public view returns (uint256) {
        return pendingRoundList.length;
    }

    /// @notice Determine user could claim pending redemption or not
    /// @param user_ address could be claimable
    /// @return true if claimable otherwise false
    function isPendingRedemptionClaimable(address user_) public view returns (bool) {
        return pendingUsers[user_].pendingRound < currentPendingRound() && pendingUsers[user_].pendingShare > 0;
    }

    function _calcPendingRedemption(address user_) internal view returns (uint256) {
        PendingUserInfo storage pendingUser = pendingUsers[user_];
        PendingRoundInfo storage pendingRoundInfo = pendingRoundList[pendingUser.pendingRound];
        return (pendingRoundInfo.totalRedemption * pendingUser.pendingShare) / pendingRoundInfo.totalPendingShare;
    }

    function _getResolvePendingShare(bool applyPenalty_) internal view returns (uint256) {
        if (applyPenalty_) {
            return currentTotalPendingShare;
        } else {
            return currentTotalPendingShare + currentTotalPendingBonus;
        }
    }

    function _getPendingPenalty() internal view virtual returns (uint256) {
        return comptroller.pendingPenalty();
    }

    function __getReserve() internal view virtual returns (uint256);

    function __getGrossAssetValue() internal view virtual returns (uint256);

    function _beforePurchase() internal virtual returns (uint256) {
        return 0;
    }

    function _afterPurchase(uint256 grossAssetValue_) internal virtual {
        grossAssetValue_;
        return;
    }

    function _beforeRedeem() internal virtual returns (uint256) {
        return 0;
    }

    function _afterRedeem(uint256 grossAssetValue_) internal virtual {
        grossAssetValue_;
        return;
    }

    function _addShare(
        address user_,
        uint256 balance_,
        uint256 grossAssetValue_
    ) internal virtual returns (uint256 share) {
        share = _calculateShare(balance_, grossAssetValue_);

        // Lock MINIMUM_SHARE to share token contract itself for the initial puchase
        // Share token contract has blocked transfer from itself
        if (shareToken.grossTotalShare() == 0) {
            shareToken.mint(address(shareToken), MINIMUM_SHARE);
        }

        shareToken.mint(user_, share);
    }

    function _settlePendingShare(bool applyPenalty_) internal returns (uint256 totalRedemption) {
        // Get total share for the settle
        uint256 redeemShare = _getResolvePendingShare(applyPenalty_);

        if (redeemShare > 0) {
            // Calculate the total redemption depending on the redeemShare
            totalRedemption = _redeem(address(this), redeemShare, false);

            // Settle this round and store settle info to round list
            pendingRoundList.push(
                PendingRoundInfo({totalPendingShare: currentTotalPendingShare, totalRedemption: totalRedemption})
            );

            currentTotalPendingShare = 0; // reset currentTotalPendingShare
            if (applyPenalty_) {
                // if applyPenalty is true that means there are some share as bonus share
                // need to burn these bonus share if they are remaining
                if (currentTotalPendingBonus != 0) {
                    shareToken.burn(address(this), currentTotalPendingBonus); // burn unused bonus
                    currentTotalPendingBonus = 0;
                }
            } else {
                currentTotalPendingBonus = 0;
            }

            emit PendingShareSettled();
        }
    }
}
