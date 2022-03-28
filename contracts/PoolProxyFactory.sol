// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {PoolProxy} from "./PoolProxy.sol";
import {ShareToken} from "./ShareToken.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IPool} from "./interfaces/IPool.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";
import {Errors} from "./utils/Errors.sol";

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
        IERC20Metadata denomination,
        uint256 level,
        uint256 mFeeRate,
        uint256 pFeeRate,
        uint256 crystallizationPeriod,
        uint256 reserveExecutionRate,
        string memory shareTokenName
    ) external returns (address) {
        Errors._require(
            comptroller.isValidCreator(msg.sender),
            Errors.Code.POOL_PROXY_FACTORY_INVALID_CREATOR
        );
        Errors._require(
            comptroller.isValidDenomination(address(denomination)),
            Errors.Code.POOL_PROXY_FACTORY_INVALID_DENOMINATION
        );
        IMortgageVault mortgageVault = comptroller.mortgageVault();
        (bool isStakedTierSet, uint256 mortgageAmount) = comptroller.stakedTier(
            level
        );
        Errors._require(
            isStakedTierSet,
            Errors.Code.POOL_PROXY_FACTORY_INVALID_STAKED_TIER
        );
        // Can be customized
        ShareToken share = new ShareToken(
            shareTokenName,
            "FFST",
            denomination.decimals()
        );
        bytes memory data = abi.encodeWithSignature(
            "initialize(uint256,address,address,address,uint256,uint256,uint256,uint256,address)",
            level,
            address(comptroller),
            address(denomination),
            address(share),
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
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
