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

/// @title The implementation contract for pool.
/// @notice The functions that requires ownership, interaction between
/// different modules should be override and implemented here.
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

    /// @notice Initializer.
    /// @param level_ The tier of the pool.
    /// @param comptroller_ The comptroller address.
    /// @param denomination_ The denomination asset.
    /// @param shareToken_ The share token address.
    /// @param mFeeRate_ The management fee rate.
    /// @param pFeeRate_ The performance fee rate.
    /// @param crystallizationPeriod_ The crystallization period.
    /// @param reserveExecution_ The reserve amount during execution.
    /// @param newOwner The owner to be assigned to the pool.
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

    /////////////////////////////////////////////////////
    // General
    /////////////////////////////////////////////////////
    /// @notice Return the manager address.
    /// @return Manager address.
    function getManager() public view override returns (address) {
        return owner();
    }

    /// @notice Finalize the initialization of the pool.
    function finalize() public onlyOwner {
        _finalize();
    }

    /// @notice Liquidate the pool.
    function liquidate() public onlyOwner {
        _liquidate();
    }

    /// @notice Get the current reserve amount of the pool.
    /// @return The reserve amount.
    function __getReserve() internal view override returns (uint256) {
        return getReserve();
    }

    /// @notice Get the total asset value of the pool.
    /// @return The value of asset.
    function __getTotalAssetValue()
        internal
        view
        override(FeeModule, ShareModule)
        returns (uint256)
    {
        address[] memory assets = getAssetList();
        uint256 length = assets.length;
        uint256[] memory amounts = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            amounts[i] = IERC20(assets[i]).balanceOf(address(vault));
        }

        return
            comptroller.assetRouter().calcAssetsTotalValue(
                assets,
                amounts,
                address(denomination)
            );
    }

    /////////////////////////////////////////////////////
    // Asset Module
    /////////////////////////////////////////////////////
    /// @notice Add the asset to the tracking list.
    /// @param asset The asset to be added.
    function addAsset(address asset) public override {
        require(
            comptroller.validateDealingAsset(level, asset),
            "Invalid asset"
        );
        int256 value = getAssetValue(asset);
        int256 dust = int256(comptroller.getDenominationDust(asset));
        require(value > dust || value < 0, "No such asset");
        super.addAsset(asset);
    }

    /// @notice Remove the asset from the tracking list.
    /// @param asset The asset to be removed.
    function removeAsset(address asset) public override {
        int256 value = getAssetValue(asset);
        int256 dust = int256(comptroller.getDenominationDust(asset));
        require(value <= dust && value >= 0, "Remaining asset");
        super.removeAsset(asset);
    }

    /// @notice Get the value of a give asset.
    /// @param asset The asset to be queried.
    function getAssetValue(address asset) public view returns (int256) {
        uint256 balance = IERC20(asset).balanceOf(address(vault));
        if (balance == 0) return 0;

        return
            comptroller.assetRouter().calcAssetValue(
                asset,
                balance,
                address(denomination)
            );
    }

    /////////////////////////////////////////////////////
    // Execution module
    /////////////////////////////////////////////////////
    /// @notice Execute an action on the pool's behalf.
    /// @param data The execution data to be applied.
    function execute(bytes calldata data) public override onlyOwner {
        super.execute(data);
    }

    /// @notice Check the reserve after the execution.
    function _afterExecute() internal override returns (bool) {
        require(__getReserve() >= reserveExecution, "Insufficient reserve");
        return super._afterExecute();
    }

    /////////////////////////////////////////////////////
    // Share module
    /////////////////////////////////////////////////////
    /// @notice Update the management fee and performance fee before purchase
    /// to get the lastest share price.
    function _callBeforePurchase(uint256) internal override {
        _updateManagementFee();
        _updatePerformanceFee();
        return;
    }

    /// @notice Update the gross share price after the purchase.
    function _callAfterPurchase(uint256) internal override {
        _updateGrossSharePrice();
        return;
    }

    /// @notice Update the management fee and performance fee before redeem
    /// to get the latest share price.
    function _callBeforeRedeem(uint256) internal override {
        _updateManagementFee();
        _updatePerformanceFee();
        return;
    }

    /// @notice Payout the performance fee for the redempt portion and update
    /// the gross share price.
    function _callAfterRedeem(uint256 amount) internal override {
        _redemptionPayout(amount);
        _updateGrossSharePrice();
        return;
    }
}
