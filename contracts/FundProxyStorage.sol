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

abstract contract FundProxyStorageV1 is Ownable, ReentrancyGuard {
    using LibUniqueAddressList for LibUniqueAddressList.List;

    enum State {
        Initializing,
        Reviewing,
        Executing,
        RedemptionPending,
        Liquidating,
        Closed
    }

    struct PendingUserInfo {
        uint256 pendingRound;
        uint256 pendingShare;
    }

    struct PendingRoundInfo {
        uint256 totalPendingShare;
        uint256 totalRedemption;
    }

    // Common
    uint256 public level;
    uint256 public reserveExecutionRate;
    uint256 public pendingStartTime;
    State public state;
    IComptroller public comptroller;
    IERC20 public denomination;
    IShareToken public shareToken;
    IDSProxy public vault; // DSProxy
    IMortgageVault public mortgageVault;

    // Asset module
    LibUniqueAddressList.List internal _assetList;

    // Share module
    uint256 public currentTotalPendingShare;
    uint256 public currentTotalPendingBonus;
    PendingRoundInfo[] public pendingRoundList;
    mapping(address => PendingUserInfo) public pendingUsers;

    // Management fee module
    uint256 public lastMFeeClaimTime;
    int128 internal _mFeeRate64x64;

    // Performance fee module
    int128 public hwm64x64; // should be a float point number
    int128 public lastGrossSharePrice64x64;
    int128 internal _pFeeRate64x64;
    uint256 internal _pFeeSum;
    uint256 internal _lastOutstandingShare;
    uint256 internal _crystallizationStart;
    uint256 internal _crystallizationPeriod;
    uint256 internal _lastCrystallization;
}

abstract contract FundProxyStorage is FundProxyStorageV1 {}
