// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibUniqueAddressList} from "./libraries/LibUniqueAddressList.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";

abstract contract PoolProxyStorageV1 {
    using LibUniqueAddressList for LibUniqueAddressList.List;

    enum State {
        Initializing,
        Reviewing,
        Executing,
        RedemptionPending,
        Liquidating,
        Closed
    }

    struct pendingUserInfo {
        uint256 pendingRound;
        uint256 pendingShares;
    }

    struct pendingRoundInfo {
        uint256 totalPendingShare;
        uint256 totalRedemption;
    }

    // Slot 0: owner address

    // Common
    uint256 public level;
    uint256 public reserveExecutionRatio; // reserve ratio, base is 1e4. 100 means 1%
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
    uint256 public totalPendingShare;
    uint256 public totalPendingBonus;
    pendingRoundInfo[] public pendingRoundList;
    mapping(address => pendingUserInfo) public pendingUsers;

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

abstract contract PoolProxyStorage is PoolProxyStorageV1 {}
