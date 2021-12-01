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
    ) external returns (address) {
        ShareToken share = new ShareToken("TEST", "TST");
        bytes memory data = abi.encodeWithSignature(
            "initialize(uint256,address,address,address,uint256,address)",
            level,
            address(share),
            address(comptroller),
            address(denomination),
            reserveExecution,
            msg.sender
        );
        IPool pool = IPool(address(new PoolProxy(address(comptroller), data)));
        share.transferOwnership(address(pool));
        return address(pool);
    }
}
