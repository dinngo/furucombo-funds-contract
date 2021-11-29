// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolProxy} from "./PoolProxy.sol";
import {ShareToken} from "./ShareToken.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IPool} from "./interfaces/IPool.sol";

contract PoolProxyFactory {
    IComptroller public comptroller;

    function createPool(
        IERC20 denomination,
        uint256 level,
        uint256 reserveExecution
    ) public returns (address) {
        IPool pool = IPool(address(new PoolProxy(address(comptroller), "")));
        ShareToken share = new ShareToken("TEST", "TST");
        // Query comptroller for staking amount
        pool.initialize(
            level,
            address(share),
            address(comptroller),
            address(denomination),
            reserveExecution
        );
        pool.initializeOwnership(msg.sender);
        return address(pool);
    }
}
