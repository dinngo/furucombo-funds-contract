// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {FundQuota} from "../libraries/FundQuota.sol";

/**
 * @dev Create immutable owner for action contract
 */
abstract contract FundQuotaAction {
    modifier quotaCleanUp() {
        _cleanFundQuota();
        _;
        _cleanFundQuota();
    }

    function _getFundQuota(address fund) internal view returns (uint256) {
        return FundQuota._get(fund);
    }

    function _isFundQuotaZero(address fund) internal view returns (bool) {
        return _getFundQuota(fund) == 0;
    }

    function _setFundQuota(address fund, uint256 quota) internal {
        FundQuota._set(fund, quota);
    }

    function _increaseFundQuota(address fund, uint256 quota) internal {
        uint256 oldQuota = FundQuota._get(fund);
        _setFundQuota(fund, oldQuota + quota);
    }

    function _decreaseFundQuota(address fund, uint256 quota) internal {
        uint256 oldQuota = FundQuota._get(fund);
        require(oldQuota >= quota, "FundQuotaAction: insufficient quota");
        _setFundQuota(fund, oldQuota - quota);
    }

    function _cleanFundQuota() internal {
        FundQuota._clean();
    }
}
