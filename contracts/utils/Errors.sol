// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Errors {
    error revertCode(Code errorCode);

    enum Code {
        COMPTROLLER_HALTED,
        COMPTROLLER_BANNED,
        MORTGAGE_VAULT_,
        SHARE_TOKEN_,
        IMPLEMENTATION_ASSET_LIST_NOT_EMPTY,
        IMPLEMENTATION_PENDING_NOT_START,
        IMPLEMENTATION_PENDING_NOT_EXPIRE,
        IMPLEMENTATION_INSUFFICIENT_RESERVE,
        IMPLEMENTATION_INVALID_ASSET,
        IMPLEMENTATION_INVALID_DENOMINATION,
        POOL_PROXY_FACTORY_,
        POOL_PROXY_,
        POOL_STATE_,
        TASK_EXECUTOR_,
        AFURUCOMBO_,
        CHAINLINK_,
        ASSET_ROUTER_,
        ASSET_REGISTRY_,
        RESOLVER_BASE_,
        RCURVE_STABLE_,
        ASSET_MODULE_,
        PERFORMANCE_FEE_
    }

    function _require(bool condition, Code errorCode) internal pure {
        if (!condition) revert revertCode(errorCode);
    }
}
