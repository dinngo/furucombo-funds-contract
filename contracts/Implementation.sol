// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {PoolState} from "./PoolState.sol";
import {ExecutionModule} from "./modules/ExecutionModule.sol";
import {ShareModule} from "./modules/ShareModule.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareERC20} from "./interfaces/IShareERC20.sol";

contract Implementation is Ownable, ShareModule, ExecutionModule {
    IDSProxyRegistry public immutable dsProxyRegistry;

    constructor(IDSProxyRegistry dsProxyRegistry_) {
        dsProxyRegistry = dsProxyRegistry_;
    }

    function initializeShare(IShareERC20 shareToken_) public {
        require(address(shareToken) == address(0), "Share is initialized");
        shareToken = shareToken_;
    }

    function initializeOwnership(address newOwner) public {
        address owner = owner();
        require(owner == address(0), "Owner is initialized");
        _transferOwnership(newOwner);
    }

    function initializeComptroller(IComptroller comptroller_) public {
        require(
            address(comptroller) == address(0),
            "Comptroller is initialized"
        );
        comptroller = comptroller_;
    }

    function initializeDenomination(IERC20 denomination) public pure {
        require(
            address(denomination) == address(0),
            "Denomination is initialized"
        );
        denomination = denomination_;
    }

    function initializeDSProxy() public {
        address dsProxy = dsProxyRegistry.build();
        vault = IDSProxy(dsProxy);
    }
}
