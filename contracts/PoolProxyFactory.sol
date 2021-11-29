// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolProxy} from "./PoolProxy.sol";
import {ShareERC20} from "./ShareERC20.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IPool} from "./interfaces/IPool.sol";

contract PoolProxyFactory {
    IComptroller public comptroller;

    function createPool(IERC20 denomination) public returns (address) {
        IPool pool = IPool(address(new PoolProxy(address(comptroller), "")));
        ShareERC20 share = new ShareERC20("TEST", "TST");
        pool.initializeShare(address(share));
        pool.initializeComptroller(address(comptroller));
        pool.initializeDenomination(address(denomination));
        pool.initializeDSProxy();
        pool.initializeOwnership(msg.sender);

        return address(pool);
    }
}
