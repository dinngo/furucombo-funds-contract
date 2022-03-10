// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Errors {
    error revertCode(Code errorCode);

    enum Code {
        COMPTROLLER_HALTED, // 0:
        COMPTROLLER_BANNED, // 1:
        COMPTROLLER_ZERO_ADDRESS, // 2:
        COMPTROLLER_INVALID_LENGTH, // 3:
        MORTGAGE_VAULT_POOL_STAKED, // 4:
        SHARE_TOKEN_INVALID_TO, // 5:
        IMPLEMENTATION_ASSET_LIST_NOT_EMPTY, // 6: assetList is not empty
        IMPLEMENTATION_PENDING_NOT_START, // 7: Pending does not start
        IMPLEMENTATION_PENDING_NOT_EXPIRE, // 8: Pending does not expire
        IMPLEMENTATION_INSUFFICIENT_RESERVE, // 9: Insufficient reserve
        IMPLEMENTATION_INVALID_ASSET, // 10: Invalid asset
        IMPLEMENTATION_INVALID_DENOMINATION, // 11: Invalid denomination
        POOL_PROXY_FACTORY_INVALID_CREATOR, // 12:
        // POOL_PROXY_,
        POOL_STATE_LEVEL_IS_SET, // 13:
        POOL_STATE_ZERO_LEVEL, // 14:
        POOL_STATE_COMPTROLLER_IS_INITIALIZED, // 15:
        POOL_STATE_ZERO_COMPTROLLER_ADDRESS, // 16:
        POOL_STATE_INVALID_DENOMINATION, // 17:
        POOL_STATE_SHARE_TOKEN_IS_INITIALIZED, // 18:
        POOL_STATE_ZERO_SHARE_TOKEN_ADDRESS, // 19:
        POOL_STATE_MORTGAGE_VAULT_IS_INITIALIZED, // 20:
        POOL_STATE_UNINITIALIZED_MORTGAGE_VAULT, // 21:
        POOL_STATE_VAULT_IS_INITIALIZED, // 22:
        POOL_STATE_ZERO_REGISTRY, // 23:
        POOL_STATE_UNINITIALIZED_VAULT, // 24:
        POOL_STATE_ZERO_SETUP_ACTION_ADDRESS, // 25:
        POOL_STATE_WRONG_ALLOWANCE, // 26:
        TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT, // 27:
        TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT, // 28:
        TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL, // 29:
        TASK_EXECUTOR_LOW_LEVEL_DELEGATE_CALL_FAILED, // 30:
        TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL, // 31:
        TASK_EXECUTOR_LOW_LEVEL_CALL_WITH_VALUE_FAILED, // 32:
        TASK_EXECUTOR_INVALID_DEALING_ASSET, // 33:
        TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK, // 34:
        TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED, // 35:
        TASK_EXECUTOR_ILLEGAL_LENGTH_FOR_PARSE, // 36:
        TASK_EXECUTOR_STACK_OVERFLOW, // 37:
        TASK_EXECUTOR_INVALID_INITIAL_ASSET, // 38:
        TASK_EXECUTOR_NON_ZERO_QUOTA, // 39:
        AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 40:
        AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL, // 41:
        CHAINLINK_ZERO_AMOUNT, // 42:
        CHAINLINK_INVALID_LENGTH, // 43:
        CHAINLINK_ZERO_ADDRESS, // 44:
        CHAINLINK_EXISTING_ASSET, // 45:
        CHAINLINK_NON_EXISTENT_ASSET, // 46:
        CHAINLINK_INVALID_PRICE, // 47:
        CHAINLINK_STALE_PRICE, // 48:
        ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 49:
        ASSET_ROUTER_NEGATIVE_VALUE, // 50:
        ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS, // 51:
        ASSET_REGISTRY_ZERO_ASSET_ADDRESS, // 52:
        ASSET_REGISTRY_BANNED_RESOLVER, // 53:
        ASSET_REGISTRY_REGISTERED_RESOLVER, // 54:
        ASSET_REGISTRY_NON_REGISTERED_RESOLVER, // 55:
        ASSET_REGISTRY_NON_BANNED_RESOLVER, // 56:
        ASSET_REGISTRY_UNREGISTERED, // 57:
        RESOLVER_BASE_NEGATIVE_AMOUNT, // 58:
        RCURVE_STABLE_ZERO_ASSET_ADDRESS, // 59:
        RCURVE_STABLE_ZERO_POOL_ADDRESS, // 60:
        RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS, // 61:
        RCURVE_STABLE_ZERO_VALUED_ASSET_DECIMAL, // 62:
        RCURVE_STABLE_POOL_INFO_IS_NOT_SET, // 63:
        ASSET_MODULE_DIFFERENT_ASSET_REMAINING, // 64:
        PERFORMANCE_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 65:
        PERFORMANCE_FEE_CRYSTALLIZATION_PERIOD_TOO_SHORT, // 66:
        PERFORMANCE_FEE_CAN_NOT_CRYSTALLIZED_YET, // 67:
        MANAGEMENT_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 68:
        SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION // 69:
    }

    function _require(bool condition, Code errorCode) internal pure {
        if (!condition) revert revertCode(errorCode);
    }
}
