// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDSProxy, IDSProxyRegistry} from "../interfaces/IDSProxy.sol";
import {FundImplementation} from "../FundImplementation.sol";
import {IComptroller} from "../interfaces/IComptroller.sol";
import {IShareToken} from "../interfaces/IShareToken.sol";

contract DSProxyRegistryMock {
    function build() external pure returns (address) {
        return address(0);
    }
}
