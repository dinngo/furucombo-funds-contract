// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolProxy} from "./PoolProxy.sol";
import {ShareToken} from "./ShareToken.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";

contract PoolProxyFactory {
    event PoolCreated(
        address indexed newPool,
        address comptroller,
        address shareToken,
        address vault
    );

    IComptroller public comptroller;

    constructor(IComptroller comptroller_) {
        comptroller = comptroller_;
    }

    function createPool(
        IERC20 denomination,
        uint256 level,
        uint256 mFeeRate,
        uint256 pFeeRate,
        uint256 crystallizationPeriod,
        uint256 reserveExecution,
        string memory shareTokenName
    ) external returns (address) {
        require(comptroller.isValidCreator(msg.sender), "Invalid creator");
        IMortgageVault mortgageVault = comptroller.mortgageVault();
        uint256 mortgageAmount = comptroller.stakedTier(level);
        // Can be customized
        ShareToken share = new ShareToken(shareTokenName, "FFST");
        bytes memory data = abi.encodeWithSignature(
            "initialize(uint256,address,address,address,uint256,uint256,uint256,uint256,address)",
            level,
            address(comptroller),
            address(denomination),
            address(share),
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecution,
            msg.sender
        );

        IPool pool = IPool(address(new PoolProxy(address(comptroller), data)));
        mortgageVault.stake(msg.sender, address(pool), mortgageAmount);
        share.transferOwnership(address(pool));
        emit PoolCreated(
            address(pool),
            address(comptroller),
            address(share),
            pool.vault()
        );
        return address(pool);
    }
}
