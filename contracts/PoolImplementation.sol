// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {AssetModule} from "./modules/AssetModule.sol";
import {ExecutionModule} from "./modules/ExecutionModule.sol";
import {ManagementFeeModule} from "./modules/ManagementFeeModule.sol";
import {PerformanceFeeModule} from "./modules/PerformanceFeeModule.sol";
import {ShareModule} from "./modules/ShareModule.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IDSProxy, IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {IShareToken} from "./interfaces/IShareToken.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";
import {ISetupAction} from "./interfaces/ISetupAction.sol";
import {SetupAction} from "./actions/SetupAction.sol";

import {Errors} from "./utils/Errors.sol";

/// @title The implementation contract for pool.
/// @notice The functions that requires ownership, interaction between
/// different modules should be override and implemented here.
contract PoolImplementation is
    Ownable,
    AssetModule,
    ShareModule,
    ExecutionModule,
    ManagementFeeModule,
    PerformanceFeeModule
{
    uint256 private constant _RESERVE_BASE = 1e4;
    uint256 private constant _TOLERANCE_BASE = 1e4;

    IDSProxyRegistry public immutable dsProxyRegistry;
    ISetupAction public immutable setupAction;

    constructor(IDSProxyRegistry dsProxyRegistry_) {
        dsProxyRegistry = dsProxyRegistry_;
        setupAction = new SetupAction();
    }

    /////////////////////////////////////////////////////
    // State Changes
    /////////////////////////////////////////////////////
    /// @notice Initializer.
    /// @param level_ The tier of the pool.
    /// @param comptroller_ The comptroller address.
    /// @param denomination_ The denomination asset.
    /// @param shareToken_ The share token address.
    /// @param mFeeRate_ The management fee rate.
    /// @param pFeeRate_ The performance fee rate.
    /// @param crystallizationPeriod_ The crystallization period.
    /// @param reserveExecutionRatio_ The reserve ratio during execution.
    /// @param newOwner The owner to be assigned to the pool.
    function initialize(
        uint256 level_,
        IComptroller comptroller_,
        IERC20 denomination_,
        IShareToken shareToken_,
        uint256 mFeeRate_,
        uint256 pFeeRate_,
        uint256 crystallizationPeriod_,
        uint256 reserveExecutionRatio_,
        address newOwner
    ) external whenState(State.Initializing) {
        _setLevel(level_);
        _setComptroller(comptroller_);
        _setDenomination(denomination_);
        _setShareToken(shareToken_);
        _setManagementFeeRate(mFeeRate_);
        _setPerformanceFeeRate(pFeeRate_);
        _setCrystallizationPeriod(crystallizationPeriod_);
        _setReserveExecutionRatio(reserveExecutionRatio_);
        _setVault(dsProxyRegistry);
        _transferOwnership(newOwner);
        _setMortgageVault(comptroller_);

        _review();
    }

    /// @notice Finalize the initialization of the pool.
    function finalize() public onlyOwner {
        _finalize();

        // Add denomination to list and never remove
        Errors._require(
            getAssetList().length == 0,
            Errors.Code.IMPLEMENTATION_ASSET_LIST_NOT_EMPTY
        );

        Errors._require(
            comptroller.isValidDenomination(address(denomination)),
            Errors.Code.IMPLEMENTATION_INVALID_DENOMINATION
        );
        addAsset(address(denomination));

        // Set approval for investor to redeem
        _setVaultApproval(setupAction);

        // Initialize management fee parameters
        _initializeManagementFee();

        // Initialize performance fee parameters
        _initializePerformanceFee();
    }

    /// @notice Resume the pool by anyone if can settle pending redeemption.
    function resume() public whenState(State.RedemptionPending) {
        Errors._require(
            isPendingResolvable(true),
            Errors.Code.IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE
        );
        _settlePendingRedemption(true);
        _resume();
    }

    /// @notice Liquidate the pool by anyone and transfer owner to liquidator.
    function liquidate() public {
        Errors._require(
            pendingStartTime != 0,
            Errors.Code.IMPLEMENTATION_PENDING_NOT_START
        );
        Errors._require(
            block.timestamp >=
                pendingStartTime + comptroller.pendingExpiration(),
            Errors.Code.IMPLEMENTATION_PENDING_NOT_EXPIRE
        );

        _liquidate();

        mortgageVault.claim(comptroller.owner());
        _transferOwnership(comptroller.pendingLiquidator());
    }

    /// @notice Close the pool. The pending redemption will be settled
    /// without penalty.
    function close()
        public
        override
        onlyOwner
        whenStates(State.Executing, State.Liquidating)
    {
        if (_getResolvePendingShares(false) > 0) {
            _settlePendingRedemption(false);
        }

        super.close();

        mortgageVault.claim(msg.sender);
    }

    /////////////////////////////////////////////////////
    // Setters
    /////////////////////////////////////////////////////
    /// @notice Set management fee rate only during reviewing.
    function setManagementFeeRate(uint256 mFeeRate_)
        external
        onlyOwner
        whenState(State.Reviewing)
    {
        _setManagementFeeRate(mFeeRate_);
    }

    /// @notice Set performance fee rate only during reviewing.
    function setPerformanceFeeRate(uint256 pFeeRate_)
        external
        onlyOwner
        whenState(State.Reviewing)
    {
        _setPerformanceFeeRate(pFeeRate_);
    }

    /// @notice Set crystallization period only during reviewing.
    function setCrystallizationPeriod(uint256 crystallizationPeriod_)
        external
        onlyOwner
        whenState(State.Reviewing)
    {
        _setCrystallizationPeriod(crystallizationPeriod_);
    }

    /// @notice Set reserve ratio only during reviewing.
    function setReserveExecutionRatio(uint256 reserve_)
        external
        onlyOwner
        whenState(State.Reviewing)
    {
        _setReserveExecutionRatio(reserve_);
    }

    /////////////////////////////////////////////////////
    // Getters
    /////////////////////////////////////////////////////
    /// @notice Return the manager address.
    /// @return Manager address.
    function getManager()
        public
        view
        override(ManagementFeeModule, PerformanceFeeModule)
        returns (address)
    {
        return owner();
    }

    /// @notice Get the current reserve amount of the pool.
    /// @return The reserve amount.
    function __getReserve() internal view override returns (uint256) {
        return getReserve();
    }

    /// @notice Get the total asset value of the pool.
    /// @return The value of asset.
    function getTotalAssetValue()
        public
        view
        virtual
        override(PerformanceFeeModule, ShareModule)
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
    /// @notice Add the asset to the tracking list by owner.
    /// @param asset The asset to be added.
    function addAsset(address asset) public onlyOwner {
        _addAsset(asset);
    }

    /// @notice Add the asset to the tracking list.
    /// @param asset The asset to be added.
    function _addAsset(address asset) internal override {
        Errors._require(
            comptroller.isValidDealingAsset(level, asset),
            Errors.Code.IMPLEMENTATION_INVALID_ASSET
        );

        if (asset == address(denomination)) {
            super._addAsset(asset);
        } else {
            int256 value = getAssetValue(asset);
            int256 dust = int256(
                comptroller.getDenominationDust(address(denomination))
            );

            if (value >= dust || value < 0) {
                super._addAsset(asset);
            }
        }
    }

    /// @notice Remove the asset from the tracking list by owner.
    /// @param asset The asset to be removed.
    function removeAsset(address asset) public onlyOwner {
        _removeAsset(asset);
    }

    /// @notice Remove the asset from the tracking list.
    /// @param asset The asset to be removed.
    function _removeAsset(address asset) internal override {
        // Do not allow to remove denomination from list
        address _denomination = address(denomination);
        if (asset != _denomination) {
            int256 value = getAssetValue(asset);
            int256 dust = int256(
                comptroller.getDenominationDust(_denomination)
            );

            if (value < dust && value >= 0) {
                super._removeAsset(asset);
            }
        }
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
    function _beforeExecute() internal virtual override returns (uint256) {
        return getTotalAssetValue();
    }

    function execute(bytes calldata data) public override onlyOwner {
        super.execute(data);
    }

    /// @notice Check the reserve after the execution.
    function _afterExecute(bytes memory response, uint256 prevAssetValue)
        internal
        override
        returns (uint256)
    {
        Errors._require(
            _isReserveEnough(),
            Errors.Code.IMPLEMENTATION_INSUFFICIENT_RESERVE
        );

        // remove asset from assetList
        address[] memory assetList = getAssetList();
        for (uint256 i = 0; i < assetList.length; ++i) {
            removeAsset(assetList[i]);
        }

        // add new asset to assetList
        address[] memory dealingAssets = abi.decode(response, (address[]));

        for (uint256 i = 0; i < dealingAssets.length; ++i) {
            addAsset(dealingAssets[i]);
        }

        if (state == State.RedemptionPending) {
            resume();
        }

        Errors._require(
            _isReserveEnough(),
            Errors.Code.IMPLEMENTATION_INSUFFICIENT_RESERVE
        );

        // Check asset value
        uint256 totalAssetValue = getTotalAssetValue();
        uint256 minTotalAssetValue = (prevAssetValue *
            comptroller.execAssetValueToleranceRate()) / _TOLERANCE_BASE;

        Errors._require(
            totalAssetValue >= minTotalAssetValue,
            Errors.Code.IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
        );

        return totalAssetValue;
    }

    /// @notice Check funds reserve ratio is enough or not.
    /// @return The reserve ratio is enough or not.
    function _isReserveEnough() internal view returns (bool) {
        uint256 reserveRatio = (getReserve() * _RESERVE_BASE) /
            getTotalAssetValue();
        return reserveRatio >= reserveExecutionRatio;
    }

    /////////////////////////////////////////////////////
    // Management fee module
    /////////////////////////////////////////////////////
    /// @notice Manangement fee should only be accumulated in executing state.
    function _updateManagementFee() internal override returns (uint256) {
        if (state == State.Executing) {
            return super._updateManagementFee();
        } else {
            lastMFeeClaimTime = block.timestamp;
            return 0;
        }
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
        if (state == State.RedemptionPending && isPendingResolvable(true)) {
            _settlePendingRedemption(true);
            _resume();
        }
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
