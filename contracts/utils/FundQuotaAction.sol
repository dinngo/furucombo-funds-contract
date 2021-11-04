// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/FundQuota.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract FundQuotaAction {
    modifier quotaCleanUp() {
        cleanFundQuota();
        _;
        cleanFundQuota();
    }

    function getFundQuota(address key) internal view returns (uint256) {
        return FundQuota.get(key);
    }

    function isFundQuotaZero(address key) internal view returns (bool) {
        return getFundQuota(key) == 0;
    }

    function setFundQuota(address key, uint256 val) internal {
        FundQuota.set(key, val);
    }

    function increaseFundQuota(address key, uint256 val) internal {
        uint256 oldVal = FundQuota.get(key);
        setFundQuota(key, oldVal + val);
    }

    function decreaseFundQuota(address key, uint256 val) internal {
        uint256 oldVal = FundQuota.get(key);
        setFundQuota(key, oldVal - val);
    }

    function cleanFundQuota() internal {
        FundQuota.clean();
    }
}
