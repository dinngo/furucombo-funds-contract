// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {PoolState} from "./PoolState.sol";
import {ExecutionModule} from "./modules/ExecutionModule.sol";
import {FeeModule} from "./modules/FeeModule.sol";
import {ShareModule} from "./modules/ShareModule.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareERC20} from "./interfaces/IShareERC20.sol";

contract Implemetation is Ownable, ShareModule, ExecutionModule, FeeModule {
    IDSProxyRegistry public immutable dsProxyRegistry;

    constructor(IDSProxyRegistry dsProxyRegistry_) {
        dsProxyRegistry = dsProxyRegistry_;
    }

    function afterExecute() public override returns (bool) {
        require(getReserve() >= reserveExecution, "Insufficient reserve");
        return super.afterExecute();
    }

    function initializeOwnership(address newOwner) public {
        address owner = owner();
        require(owner == address(0), "Owner is initialized");
        _transferOwnership(newOwner);
    }

    function initializeComptroller(IComptroller comptroller) public {
        _setComptroller(comptroller);
    }

    function initializeDenomination(IERC20 denomination) public {
        _setDenomination(denomination);
    }

    function initializeShare(IShareERC20 shareToken) public onlyOwner {
        _setShare(shareToken);
    }

    function initializeDSProxy() public {
        address dsProxy = dsProxyRegistry.build();
        _setDSProxy(IDSProxy(dsProxy));
    }

    function initializeReserveExecution(uint256 reserveExecution) public {
        _setReserveExecution(reserveExecution);
    }

    function execute(bytes calldata data) public override onlyOwner {
        super.execute(data);
    }
}
