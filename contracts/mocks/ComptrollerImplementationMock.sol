// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ComptrollerImplementation} from "../ComptrollerImplementation.sol";
import {IMortgageVault} from "../interfaces/IMortgageVault.sol";

contract ComptrollerImplementationMock is ComptrollerImplementation {
    function setMortgageVault(IMortgageVault mortgageVault_) external {
        mortgageVault = mortgageVault_;
    }
}
