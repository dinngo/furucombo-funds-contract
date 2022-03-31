// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IShareToken} from "./IShareToken.sol";

interface IFund {
    function initializeOwnership(address newOwner_) external;

    function level() external returns (uint256);

    function vault() external view returns (address);

    function initialize(
        uint256 level_,
        address comptroller_,
        address denomination_,
        address shareToken_,
        uint256 reserveExecutionRate_
    ) external;
}
