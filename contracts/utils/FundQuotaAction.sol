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

    function getFundQuota(address fund) internal view returns (uint256) {
        return FundQuota.get(fund);
    }

    function isFundQuotaZero(address fund) internal view returns (bool) {
        return getFundQuota(fund) == 0;
    }

    function setFundQuota(address fund, uint256 quota) internal {
        FundQuota.set(fund, quota);
    }

    function increaseFundQuota(address fund, uint256 quota) internal {
        uint256 oldQuota = FundQuota.get(fund);
        setFundQuota(fund, oldQuota + quota);
    }

    function decreaseFundQuota(address fund, uint256 quota) internal {
        uint256 oldQuota = FundQuota.get(fund);
        require(oldQuota >= quota, "insufficient quota");
        setFundQuota(fund, oldQuota - quota);
    }

    function cleanFundQuota() internal {
        FundQuota.clean();
    }
}
