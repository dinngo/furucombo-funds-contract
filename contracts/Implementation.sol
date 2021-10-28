// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolState} from "./PoolState.sol";
import {ShareModule} from "./modules/ShareModule.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";

contract Implemetation is Ownable, ShareModule {
    IDSProxyRegistry public immutable dsProxyRegistry;

    constructor(
        IDSProxyRegistry dsProxyRegistry_,
        string memory name_,
        string memory symbol_
    ) ERC20Permit(name_) ERC20(name_, symbol_) {
        dsProxyRegistry = dsProxyRegistry_;
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

    function initializeDenomination(IERC20 denomination_) public {
        require(
            address(denomination) == address(0),
            "Denomination is initialized"
        );
    }

    function initializeDSProxy() public {
        address dsProxy = dsProxyRegistry.build();
        vault = IDSProxy(dsProxy);
    }
}
