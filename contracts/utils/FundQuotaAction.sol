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

    function _getFundQuota(address fund_) internal view returns (uint256) {
        return FundQuota._get(fund_);
    }

    function _isFundQuotaZero(address fund_) internal view returns (bool) {
        return _getFundQuota(fund_) == 0;
    }

    function _setFundQuota(address fund_, uint256 quota_) internal {
        FundQuota._set(fund_, quota_);
    }

    function _increaseFundQuota(address fund_, uint256 quota_) internal {
        uint256 oldQuota = FundQuota._get(fund_);
        _setFundQuota(fund_, oldQuota + quota_);
    }

    function _decreaseFundQuota(address fund_, uint256 quota_) internal {
        uint256 oldQuota = FundQuota._get(fund_);
        require(oldQuota >= quota_, "FundQuotaAction: insufficient quota");
        _setFundQuota(fund_, oldQuota - quota_);
    }

    function _cleanFundQuota() internal {
        FundQuota._clean();
    }
}
