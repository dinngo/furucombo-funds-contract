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

    // Initiators
    function initialize(
        uint256 level_,
        IComptroller comptroller_,
        IERC20 denomination_,
        IShareToken shareToken_,
        uint256 mFeeRate_,
        uint256 pFeeRate_,
        uint256 crystallizationPeriod_,
        uint256 reserveExecution_,
        address newOwner
    ) external {
        _setLevel(level_);
        _setComptroller(comptroller_);
        _setDenomination(denomination_);
        _setShare(shareToken_);
        _setManagementFeeRate(mFeeRate_);
        _setPerformanceFeeRate(pFeeRate_);
        _setCrystallizationPeriod(crystallizationPeriod_);
        _setReserveExecution(reserveExecution_);
        address dsProxy_ = dsProxyRegistry.build();
        _setDSProxy(IDSProxy(dsProxy_));
        _transferOwnership(newOwner);
    }

    // General
    function getManager() public view override returns (address) {
        return owner();
    }

    function finalize() public {
        _finalize();
    }

    function liquidate() public {
        _liquidate();
    }

    function __getReserve() internal view override returns (uint256) {
        return getReserve();
    }

    function __getTotalAssetValue()
        internal
        view
        override(FeeModule, ShareModule)
        returns (uint256)
    {
        return 0;
    }

    // Asset Module
    function addAsset(address asset) public override {
        uint256 value = getAssetValue(asset);
        require(value > 0, "No such asset");
        super.addAsset(asset);
    }

    function removeAsset(address asset) public override {
        uint256 value = getAssetValue(asset);
        // Should be less than dust
        require(value == 0, "Remain asset");
        super.removeAsset(asset);
    }

    function getAssetValue(address asset) public view returns (uint256) {
        // Should query asset value as denomination asset
        asset;
        return 0;
    }

    function permitAsset(address asset) public override onlyOwner {
        super.permitAsset(asset);
    }

    function forbidAsset(address asset) public override onlyOwner {
        super.forbidAsset(asset);
    }

    function permitAllAsset() public override onlyOwner {
        super.permitAllAsset();
    }

    function cancelPermitAllAsset() public override onlyOwner {
        super.cancelPermitAllAsset();
    }

    // Execution module
    function execute(bytes calldata data) public override onlyOwner {
        super.execute(data);
    }

    function permitAction(address to, bytes4 sig) public override onlyOwner {
        super.permitAction(to, sig);
    }

    function forbidAction(address to, bytes4 sig) public override onlyOwner {
        super.forbidAction(to, sig);
    }

    function permitAllAction() public override onlyOwner {
        super.permitAllAction();
    }

    function cancelPermitAllAction() public override onlyOwner {
        super.cancelPermitAllAction();
    }

    function _afterExecute() internal override returns (bool) {
        require(__getReserve() >= reserveExecution, "Insufficient reserve");
        return super._afterExecute();
    }

    // Share module
    function _callBeforePurchase(uint256) internal override {
        _updateManagementFee();
        _updatePerformanceFee();
        return;
    }

    function _callAfterPurchase(uint256) internal override {
        _updateGrossSharePrice();
        return;
    }

    function _callBeforeRedeem(uint256) internal override {
        _updateManagementFee();
        _updatePerformanceFee();
        return;
    }

    function _callAfterRedeem(uint256 amount) internal override {
        _redemptionPayout(amount);
        _updateGrossSharePrice();
        return;
    }
}
