// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Errors {
    error _revertMsg(uint8 contractCode, uint8 errorCode);

    // Contract error code
    uint8 public constant EC_COMPTROLLER = 0;
    uint8 public constant EC_MORTGAGE_VAULT = 1;
    uint8 public constant EC_SHARE_TOKEN = 2;
    uint8 public constant EC_IMPLEMENTATION = 3;
    uint8 public constant EC_POOL_PROXY_FACTORY = 4;
    uint8 public constant EC_POOL_PROXY = 5;
    uint8 public constant EC_POOL_STATE = 6;
    uint8 public constant EC_TASK_EXECUTOR = 7;
    uint8 public constant EC_AFURUCOMBO = 8;
    uint8 public constant EC_CHAINLINK = 9;
    uint8 public constant EC_ASSET_ROUTER = 10;
    uint8 public constant EC_ASSET_REGISTRY = 11;
    uint8 public constant EC_RESOLVER_BASE = 12;
    uint8 public constant EC_RCURVE_STABLE = 13;
    uint8 public constant EC_RWRAPPED_TOKEN = 14;
    uint8 public constant EC_ASSET_MODULE = 15;
    uint8 public constant EC_PERFORMANCE_FEE = 16;

    // Implementation error code
    uint8 public constant IM_ASSET_LIST_NOT_EMPTY = 0;
    uint8 public constant IM_PENDING_NOT_START = 1;
    uint8 public constant IM_PENDING_NOT_EXPIRE = 2;
    uint8 public constant IM_INSUFFICIENT_RESERVE = 3;
    uint8 public constant IM_INVALID_ASSET = 4;
    uint8 public constant IM_INVALID_DENOMINATION = 5;

    // Contract error code
    enum CEC {
        COMPTROLLER,
        MORTGAGE_VAULT,
        SHARE_TOKEN,
        IMPLEMENTATION,
        POOL_PROXY_FACTORY,
        POOL_PROXY,
        POOL_STATE,
        TASK_EXECUTOR,
        AFURUCOMBO,
        CHAINLINK,
        ASSET_ROUTER,
        ASSET_REGISTRY,
        RESOLVER_BASE,
        RCURVE_STABLE,
        RWRAPPED_TOKEN,
        ASSET_MODULE,
        PERFORMANCE_FEE
    }

    // Implementation error code
    enum ImEC {
        ASSET_LIST_NOT_EMPTY,
        PENDING_NOT_START,
        PENDING_NOT_EXPIRE,
        INSUFFICIENT_RESERVE,
        INVALID_ASSET,
        INVALID_DENOMINATION
    }

    function _requireMsg(
        bool condition,
        uint8 contractCode,
        uint8 errorCode
    ) internal pure {
        if (!condition) revert _revertMsg(contractCode, errorCode);
    }
}
