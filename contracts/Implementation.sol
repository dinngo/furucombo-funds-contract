// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {AssetModule} from "./modules/AssetModule.sol";
import {ExecutionModule} from "./modules/ExecutionModule.sol";
import {FeeModule, ManagementFee, PerformanceFee} from "./modules/FeeModule.sol";
import {ShareModule} from "./modules/ShareModule.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";

contract Implementation is
    Ownable,
    AssetModule,
    ShareModule,
    ExecutionModule,
    FeeModule
{
    IDSProxyRegistry public immutable dsProxyRegistry;

    constructor(IDSProxyRegistry dsProxyRegistry_) {
        dsProxyRegistry = dsProxyRegistry_;
    }

    // Share module
    function getAssetValue()
        public
        view
        override(FeeModule, ShareModule)
        returns (uint256)
    {
        return 0;
    }

    function getReserve() public view override returns (uint256) {
        return _getReserve();
    }

    function execute(bytes calldata data) public override onlyOwner {
        super.execute(data);
    }

    function finalize() public {
        _finalize();
    }

    function liquidate() public {
        _liquidate();
    }

    function close() public override {
        super.close();
    }

    // Initiators
    function initialize(
        uint256 level_,
        IComptroller comptroller_,
        IERC20 denomination_,
        IShareToken shareToken_,
        uint256 reserveExecution_
    ) public {
        _setLevel(level_);
        _setComptroller(comptroller_);
        _setDenomination(denomination_);
        _setShare(shareToken_);
        address dsProxy_ = dsProxyRegistry.build();
        _setDSProxy(IDSProxy(dsProxy_));
        _setReserveExecution(reserveExecution_);
    }

    function initializeOwnership(address newOwner) public {
        address owner = owner();
        require(owner == address(0), "Owner is initialized");
        _transferOwnership(newOwner);
    }

    // Action management
    function permitAction(address to, bytes4 sig) public onlyOwner {
        _permitAction(to, sig);
    }

    function forbidAction(address to, bytes4 sig) public onlyOwner {
        _forbidAction(to, sig);
    }

    function permitAllAction() public onlyOwner {
        _permitAction(address(0), bytes4(0));
    }

    function cancelPermitAllAction() public onlyOwner {
        _forbidAction(address(0), bytes4(0));
    }

    function isValidAction(address to, bytes4 sig) public view returns (bool) {
        return _isValidAction(to, sig);
    }

    // Asset management
    function permitAsset(address asset) public onlyOwner {
        _permitAsset(asset);
    }

    function forbidAsset(address asset) public onlyOwner {
        _forbidAsset(asset);
    }

    function permitAllAsset() public onlyOwner {
        _permitAsset(address(0));
    }

    function cancelPermitAllAsset() public onlyOwner {
        _forbidAsset(address(0));
    }

    function isValidAsset(address asset) public view returns (bool) {
        return _isValidAsset(asset);
    }

    function getManager() public view override returns (address) {
        return owner();
    }

    function _afterExecute() internal override returns (bool) {
        require(getReserve() >= reserveExecution, "Insufficient reserve");
        return super._afterExecute();
    }

    function _callBeforePurchase(uint256) internal override {
        _mintManagementFee();
        _updatePerformanceShare();
        return;
    }

    function _callAfterPurchase(uint256) internal override {
        _updateGrossSharePrice();
        return;
    }

    function _callBeforeRedeem(uint256) internal override {
        _mintManagementFee();
        _updatePerformanceShare();
        return;
    }

    function _callAfterRedeem(uint256 amount) internal override {
        _redemptionPayout(amount);
        _updateGrossSharePrice();
        return;
    }
}
