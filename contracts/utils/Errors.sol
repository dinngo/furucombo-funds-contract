// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Errors {
    error revertCode(Code errorCode);

    enum Code {
        COMPTROLLER_HALTED, // 0: "Halted"
        COMPTROLLER_BANNED, // 1: "Banned"
        COMPTROLLER_ZERO_ADDRESS, // 2: "Zero address"
        COMPTROLLER_TOS_AND_SIGS_LENGTH_INCONSISTENT, // 3: "tos and sigs length are inconsistent"
        COMPTROLLER_DENOMINATIONS_AND_DUSTS_LENGTH_INCONSISTENT, // 4: "denominations and dusts length are inconsistent"
        MORTGAGE_VAULT_POOL_STAKED, // 5: "Pool staked"
        SHARE_TOKEN_INVALID_TO, // 6: "Invalid to"
        IMPLEMENTATION_ASSET_LIST_NOT_EMPTY, // 7: "assetList is not empty"
        IMPLEMENTATION_PENDING_NOT_START, // 8: "Pending does not start"
        IMPLEMENTATION_PENDING_NOT_EXPIRE, // 9: "Pending does not expire"
        IMPLEMENTATION_INSUFFICIENT_RESERVE, // 10: "Insufficient reserve"
        IMPLEMENTATION_INVALID_ASSET, // 11: "Invalid asset"
        IMPLEMENTATION_INVALID_DENOMINATION, // 12: "Invalid denomination"
        POOL_PROXY_FACTORY_INVALID_CREATOR, // 13: "Invalid creator"
        POOL_PROXY_STORAGE_UTILS_LEVEL_IS_SET, // 14: "Level is set"
        POOL_PROXY_STORAGE_UTILS_ZERO_LEVEL, // 15: "Level should not be 0"
        POOL_PROXY_STORAGE_UTILS_COMPTROLLER_IS_INITIALIZED, // 16: "Comptroller is initialized"
        POOL_PROXY_STORAGE_UTILS_ZERO_COMPTROLLER_ADDRESS, // 17: "Comptroller should not be zero address"
        POOL_PROXY_STORAGE_UTILS_INVALID_DENOMINATION, // 18: "Invalid denomination"
        POOL_PROXY_STORAGE_UTILS_SHARE_TOKEN_IS_INITIALIZED, // 19: "Share token is initialized"
        POOL_PROXY_STORAGE_UTILS_ZERO_SHARE_TOKEN_ADDRESS, // 20: "Share token should not be zero address"
        POOL_PROXY_STORAGE_UTILS_MORTGAGE_VAULT_IS_INITIALIZED, // 21: "MortgageVault is initialized"
        POOL_PROXY_STORAGE_UTILS_MORTGAGE_VAULT_IS_NOT_INITIALIZED, // 22: "MortgageVault is not initialized"
        POOL_PROXY_STORAGE_UTILS_VAULT_IS_INITIALIZED, // 23: "Vault is initialized"
        POOL_PROXY_STORAGE_UTILS_ZERO_REGISTRY, // 24: "Registry should not be zero address"
        POOL_PROXY_STORAGE_UTILS_VAULT_IS_NOT_INITIALIZED, // 25: "Vault is not initialized"
        POOL_PROXY_STORAGE_UTILS_ZERO_VAULT, // 26: "Vault should not be zero address"
        POOL_PROXY_STORAGE_UTILS_ZERO_SETUP_ACTION_ADDRESS, // 27: "Setup should not be zero address"
        POOL_PROXY_STORAGE_UTILS_WRONG_ALLOWANCE, // 28: "Wrong allowance"
        TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT, // 29: "tos and datas length inconsistent"
        TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT, // 30: "tos and configs length inconsistent"
        TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL, // 31: "Invalid comptroller delegate call"
        TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL, // 32: "Invalid comptroller contract call"
        TASK_EXECUTOR_INVALID_DEALING_ASSET, // 33: "Invalid dealing asset"
        TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK, // 34: "Reference to out of localStack"
        TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED, // 35: "Return num and parsed return num not matched"
        TASK_EXECUTOR_ILLEGAL_LENGTH_FOR_PARSE, // 36: "Illegal length for _parse"
        TASK_EXECUTOR_STACK_OVERFLOW, // 37: "Stack overflow"
        TASK_EXECUTOR_INVALID_INITIAL_ASSET, // 38: "Invalid initial asset"
        TASK_EXECUTOR_NON_ZERO_QUOTA, // 39: "Quota is not zero"
        AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 40: "Token length != amounts length"
        AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL, // 41: "Invalid comptroller handler call"
        CHAINLINK_ZERO_AMOUNT, // 42: "Zero amount"
        CHAINLINK_ASSETS_AND_AGGREGATORS_INCONSISTENT, // 43: assets.length == aggregators.length
        CHAINLINK_ZERO_ADDRESS, // 44: "Zero address"
        CHAINLINK_EXISTING_ASSET, // 45: "Existing asset"
        CHAINLINK_NON_EXISTENT_ASSET, // 46: "Non-existent asset"
        CHAINLINK_INVALID_PRICE, // 47: "Invalid price"
        CHAINLINK_STALE_PRICE, // 48: "Stale price"
        ASSET_ROUTER_ASSETS_AND_AMOUNTS_LENGTH_INCONSISTENT, // 49: "assets length != amounts length"
        ASSET_ROUTER_NEGATIVE_VALUE, // 50: "Negative value"
        ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS, // 51: "Resolver zero address"
        ASSET_REGISTRY_ZERO_ASSET_ADDRESS, // 52: "Asset zero address"
        ASSET_REGISTRY_BANNED_RESOLVER, // 53: "Resolver has been banned"
        ASSET_REGISTRY_REGISTERED_RESOLVER, // 54: "Resolver is registered"
        ASSET_REGISTRY_NON_REGISTERED_RESOLVER, // 55: "Asset not registered"
        ASSET_REGISTRY_NON_BANNED_RESOLVER, // 56: "Resolver is not banned"
        ASSET_REGISTRY_UNREGISTERED, // 57: "Unregistered"
        RESOLVER_BASE_NEGATIVE_AMOUNT, // 58: "amount < 0"
        RCURVE_STABLE_ZERO_ASSET_ADDRESS, // 59: "Zero asset address"
        RCURVE_STABLE_ZERO_POOL_ADDRESS, // 60: "Zero pool address"
        RCURVE_STABLE_ZERO_VALUED_ASSET_ADDRESS, // 61: "Zero valued asset address"
        RCURVE_STABLE_ZERO_VALUED_ASSET_DECIMAL, // 62: "Zero valued asset decimal"
        RCURVE_STABLE_POOL_INFO_IS_NOT_SET, // 63: "Pool info is not set"
        ASSET_MODULE_DIFFERENT_ASSET_REMAINING, // 64: "Different asset remaining"
        PERFORMANCE_FEE_MODULE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 65: "Fee rate should be less than 100%"
        PERFORMANCE_FEE_MODULE_CRYSTALLIZATION_PERIOD_TOO_SHORT, // 66: "Crystallization period too short"
        PERFORMANCE_FEE_MODULE_CAN_NOT_CRYSTALLIZED_YET, // 67: "Can not crystallized yet"
        PERFORMANCE_FEE_MODULE_TIME_BEFORE_START, // 68: "Time before start"
        MANAGEMENT_FEE_FEE_RATE_SHOULD_BE_LESS_THAN_FEE_BASE, // 69: "Fee rate should be less than 100%"
        SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION, // 70: "Redeem in pending without permission"
        AFURUCOMBO_REMAINING_TOKENS, // 71: "Furucombo has remaining tokens"
        IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE, // 72: "pending share is not resolvable"
        IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION, // 73: "Insufficient total value for execution"
        SHARE_MODULE_INSUFFICIENT_SHARES, // 74: "Insufficient share amount"
        POOL_PROXY_FACTORY_INVALID_STAKED_TIER, // 75: "Stake tier not set in comptroller"
        INVAILD_RESERVE_EXECUTION_RATIO, // 76: "Invaild reserve execution ratio"
        SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE // 77: "Pending redemption is not claimable"
    }

    function _require(bool condition, Code errorCode) internal pure {
        if (!condition) revert revertCode(errorCode);
    }

    function _revertMsg(string memory functionName, string memory reason)
        internal
        pure
    {
        revert(string(abi.encodePacked(functionName, ": ", reason)));
    }

    function _revertMsg(string memory functionName) internal pure {
        _revertMsg(functionName, "Unspecified");
    }
}
