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

    // Common
    uint256 public level;
    State public state;
    IComptroller public comptroller;
    IMortgageVault public mortgageVault;
    IERC20 public denomination;
    IShareToken public shareToken;
    IDSProxy public vault; // DSProxy
    uint256 public reserveExecutionRatio; // reserve ratio, base is 1e4. 100 means 1%
    uint256 public pendingStartTime;

    // Asset module
    LibUniqueAddressList.List internal _assetList;

    // Share module
    mapping(address => uint256) public pendingShares;
    address[] public pendingAccountList;
    mapping(address => uint256) public pendingRedemptions;
    uint256 public totalPendingShare;
    uint256 public totalPendingBonus;
    uint256 internal constant _PENALTY_BASE = 1e4;

    // Management fee module
    int128 internal _mFeeRate64x64;
    uint256 public lastMFeeClaimTime;

    // Performance fee module
    int128 internal _pFeeRate64x64;
    int128 public hwm64x64; // should be a float point number
    int128 public lastGrossSharePrice64x64;
    uint256 internal _pFeeSum;
    uint256 internal _pFeeSet;
    uint256 internal _lastOutstandingShare;
    uint256 internal _crystallizationStart;
    uint256 internal _crystallizationPeriod;
    uint256 internal _lastCrystallization;
}

abstract contract PoolProxyStorage is PoolProxyStorageV1 {}
