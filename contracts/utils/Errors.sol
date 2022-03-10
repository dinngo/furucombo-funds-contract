// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Errors {
    error revertCode(Code errorCode);

    enum Code {
        COMPTROLLER_HALTED, // 0: "Halted"
        COMPTROLLER_BANNED, // 1: "Banned"
        COMPTROLLER_ZERO_ADDRESS, // 2: "Zero address"
        COMPTROLLER_TOS_AND_SIGS_LENGTH_INCONSISTENT, // 3: "tos and sigs length are inconsistent"
        COMPTROLLER_DENOMINATIONS_AND_DUSTS_LENGTH_INCONSISTENT, // 4: "denomination and dust length are inconsistent"
        MORTGAGE_VAULT_POOL_STAKED, // 5: "Pool staked"
        SHARE_TOKEN_INVALID_TO, // 6: "Invalid to"
        IMPLEMENTATION_ASSET_LIST_NOT_EMPTY, // 7: "assetList is not empty"
        IMPLEMENTATION_PENDING_NOT_START, // 8: "Pending does not start"
        IMPLEMENTATION_PENDING_NOT_EXPIRE, // 9: "Pending does not expire"
        IMPLEMENTATION_INSUFFICIENT_RESERVE, // 10: "Insufficient reserve"
        IMPLEMENTATION_INVALID_ASSET, // 11: "Invalid asset"
        IMPLEMENTATION_INVALID_DENOMINATION, // 12: "Invalid denomination"
        POOL_PROXY_FACTORY_INVALID_CREATOR, // 13: "Invalid creator"
        POOL_STATE_LEVEL_IS_SET, // 14:
        POOL_STATE_ZERO_LEVEL, // 15:
        POOL_STATE_COMPTROLLER_IS_INITIALIZED, // 16:
        POOL_STATE_ZERO_COMPTROLLER_ADDRESS, // 17:
        POOL_STATE_INVALID_DENOMINATION, // 18:
        POOL_STATE_SHARE_TOKEN_IS_INITIALIZED, // 19:
        POOL_STATE_ZERO_SHARE_TOKEN_ADDRESS, // 20:
        POOL_STATE_MORTGAGE_VAULT_IS_INITIALIZED, // 21:
        POOL_STATE_UNINITIALIZED_MORTGAGE_VAULT, // 22:
        POOL_STATE_VAULT_IS_INITIALIZED, // 23:
        POOL_STATE_ZERO_REGISTRY, // 24:
        POOL_STATE_UNINITIALIZED_VAULT, // 25:
        POOL_STATE_ZERO_SETUP_ACTION_ADDRESS, // 26:
        POOL_STATE_WRONG_ALLOWANCE, // 27:
        TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT, // 28: "tos and datas length inconsistent"
        TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT, // 29: "tos and configs length inconsistent"
        TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL, // 30: "Invalid comptroller delegate call"
        // TASK_EXECUTOR_LOW_LEVEL_DELEGATE_CALL_FAILED, // 31: "Low-level delegate call failed"
        TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL, // 32: "Invalid comptroller contract call"
        // TASK_EXECUTOR_LOW_LEVEL_CALL_WITH_VALUE_FAILED, // 33:
        TASK_EXECUTOR_INVALID_DEALING_ASSET, // 34: "Invalid dealing asset"
        TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK, // 35: "Reference to out of localStack"
        TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED, // 36: "Return num and parsed return num not matched"
        TASK_EXECUTOR_ILLEGAL_LENGTH_FOR_PARSE, // 37: "Illegal length for _parse"
        TASK_EXECUTOR_STACK_OVERFLOW, // 38: "Stack overflow"
        TASK_EXECUTOR_INVALID_INITIAL_ASSET, // 39: "Invalid initial asset"
        TASK_EXECUTOR_NON_ZERO_QUOTA, // 40: "Quota is not zero"
        AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 41: "Token length != amounts length"
        AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL, // 42: "Invalid comptroller handler call"
        CHAINLINK_ZERO_AMOUNT, // 43: "Zero amount"
        CHAINLINK_ASSETS_AND_AGGREGATORS_INCONSISTENT, // 44: assets.length == aggregators.length
        CHAINLINK_ZERO_ADDRESS, // 45: "Zero address"
        CHAINLINK_EXISTING_ASSET, // 46: "Existing asset"
        CHAINLINK_NON_EXISTENT_ASSET, // 47: "Non-existent asset"
        CHAINLINK_INVALID_PRICE, // 48: "Invalid price"
        CHAINLINK_STALE_PRICE, // 49: "Stale price"
        ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 50: "assets length != amounts length"
        ASSET_ROUTER_NEGATIVE_VALUE, // 51: "Negative value"
        ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS, // 52: "Resolver zero address"
        ASSET_REGISTRY_ZERO_ASSET_ADDRESS, // 53: "Asset zero address"
        ASSET_REGISTRY_BANNED_RESOLVER, // 54: "Resolver has been banned"
        ASSET_REGISTRY_REGISTERED_RESOLVER, // 55: "Resolver is registered"
        ASSET_REGISTRY_NON_REGISTERED_RESOLVER, // 56: "Asset not registered"
        ASSET_REGISTRY_NON_BANNED_RESOLVER, // 57: "Resolver is not banned"
        ASSET_REGISTRY_UNREGISTERED, // 58: "Unregistered"
        RESOLVER_BASE_NEGATIVE_AMOUNT, // 59: "amount < 0"
        RCURVE_STABLE_ZERO_ASSET_ADDRESS, // 60: "Zero asset address"
        RCURVE_STABLE_ZERO_POOL_ADDRESS, // 61: "Zero pool address"
        RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS, // 62: "Zero valued asset address"
        RCURVE_STABLE_ZERO_VALUED_ASSET_DECIMAL, // 63: "Zero valued asset decimal"
        RCURVE_STABLE_POOL_INFO_IS_NOT_SET, // 64: "Pool info is not set"
        ASSET_MODULE_DIFFERENT_ASSET_REMAINING, // 65: "Different asset remaining"
        PERFORMANCE_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 66: "fee rate should be less than 100%"
        PERFORMANCE_FEE_CRYSTALLIZATION_PERIOD_TOO_SHORT, // 67: "Crystallization period too short"
        PERFORMANCE_FEE_CAN_NOT_CRYSTALLIZED_YET, // 68: "can not crystallized yet"
        MANAGEMENT_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 69: "fee rate should be less than 100%"
        SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION // 70: "Redeem in pending without permission"
    }

    function _require(bool condition, Code errorCode) internal pure {
        if (!condition) revert revertCode(errorCode);
    }
}
