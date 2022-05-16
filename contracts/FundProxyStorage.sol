// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "./libraries/LibUniqueAddressList.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";

/// @title Furucombo fund proxy storage
/// @dev This was the first version of the storage. We keep it so our tests can
///     continue to do the real-life behavior of upgrading from this logic forward.
abstract contract FundProxyStorageV1 is Ownable, ReentrancyGuard {
    /// Fund States
    /// Initializing - The state that has just been created, set the basic parameters of Fund
    /// Reviewing - After initialization, only the fee parameter can be adjusted
    /// Executing - Normal operation, when the remaining amount of denomination is positive
    /// Pending - Unable to pay withdrawal requirements will enter pending state, when the
    ///     deposit amount is sufficient or the strategy is executed to settle the debt,
    ///     it will resume to Executing state.
    /// Liquidating - When the time in the pending state exceeds pendingExpiration, it enters
    ///     the liquidation process. The fund will be transferred to the liquidator, which is
    ///     responsible for exchanging assets back to denomination tokens.
    /// Closed - When only denomination tokens are left, the fund can be closed and the investor
    ///     can redeem their share token.
    enum State {
        Initializing,
        Reviewing,
        Executing,
        Pending,
        Liquidating,
        Closed
    }

    /// Pending user info stored the number of share tokens settled per round.
    struct PendingUserInfo {
        uint256 pendingRound;
        uint256 pendingShare;
    }

    /// Pending round info stored the total pending share and total redemtion amount.
    struct PendingRoundInfo {
        uint256 totalPendingShare;
        uint256 totalRedemption;
    }

    /// @notice The level of this fund.
    uint256 public level;

    /// @notice The enter pending state timestamp.
    uint256 public pendingStartTime;

    /// @notice The current state of the fund.
    State public state;

    /// @notice The comptroller of the fund unified storage management.
    IComptroller public comptroller;

    /// @notice The denomination tokens for this fund.
    IERC20 public denomination;

    /// @notice The fund share token contract.
    IShareToken public shareToken;

    /// @notice The contract used to store fund assets, and this is DSProxy.
    IDSProxy public vault;

    /// @notice Ｔhe mortgage vault when the fund was created.
    IMortgageVault public mortgageVault;

    /// @notice The asset list currently managed by fund.
    LibUniqueAddressList.List internal _assetList;

    /// @notice The current total pending share amount.
    uint256 public currentTotalPendingShare;

    /// @notice The current total bunus share token amount.
    uint256 public currentTotalPendingBonus;

    /// @notice The pending round info list.
    PendingRoundInfo[] public pendingRoundList;

    /// @notice The pending info list for each pending user.
    mapping(address => PendingUserInfo) public pendingUsers;

    /// @notice The last management fee claim timestamp.
    uint256 public lastMFeeClaimTime;

    /// @notice The management fee rate, should be a float point number.
    int128 public mFeeRate64x64;

    /// @notice The high watter mark, should be a float point number.
    int128 public hwm64x64;

    /// @notice The last gross share price, should be a float point number.
    int128 public lastGrossSharePrice64x64;

    /// @notice The performance fee rate, should be a float point bumber.
    int128 public pFeeRate64x64;

    /// @notice The performance fee Summation.
    uint256 public pFeeSum;

    /// @notice The last outstanding share amount.
    uint256 public lastOutstandingShare;

    /// @notice The crystallization start timestamp.
    uint256 public crystallizationStart;

    /// @notice The crystallization period to be set in second.
    uint256 public crystallizationPeriod;

    /// @notice The last crystallization timestapm.
    uint256 public lastCrystallization;
}

abstract contract FundProxyStorage is FundProxyStorageV1 {}
