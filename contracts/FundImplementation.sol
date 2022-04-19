// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

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

/// @title The implementation contract for fund.
/// @notice The functions that requires ownership, interaction between
/// different modules should be override and implemented here.
contract FundImplementation is AssetModule, ShareModule, ExecutionModule, ManagementFeeModule, PerformanceFeeModule {
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
    /// @param level_ The tier of the fund.
    /// @param comptroller_ The comptroller address.
    /// @param denomination_ The denomination asset.
    /// @param shareToken_ The share token address.
    /// @param mFeeRate_ The management fee rate.
    /// @param pFeeRate_ The performance fee rate.
    /// @param crystallizationPeriod_ The crystallization period.
    /// @param reserveExecutionRate_ The reserve rate during execution.
    /// @param newOwner_ The owner to be assigned to the fund.
    function initialize(
        uint256 level_,
        IComptroller comptroller_,
        IERC20 denomination_,
        IShareToken shareToken_,
        uint256 mFeeRate_,
        uint256 pFeeRate_,
        uint256 crystallizationPeriod_,
        uint256 reserveExecutionRate_,
        address newOwner_
    ) external {
        _whenState(State.Initializing);
        _setLevel(level_);
        _setComptroller(comptroller_);
        _setDenomination(denomination_);
        _setShareToken(shareToken_);
        _setManagementFeeRate(mFeeRate_);
        _setPerformanceFeeRate(pFeeRate_);
        _setCrystallizationPeriod(crystallizationPeriod_);
        _setReserveExecutionRate(reserveExecutionRate_);
        _setVault(dsProxyRegistry);
        _transferOwnership(newOwner_);
        _setMortgageVault(comptroller_);

        _review();
    }

    /// @notice Finalize the initialization of the fund.
    function finalize() external nonReentrant onlyOwner {
        _finalize();

        // Add denomination to list and never remove
        Errors._require(getAssetList().length == 0, Errors.Code.IMPLEMENTATION_ASSET_LIST_NOT_EMPTY);

        Errors._require(
            comptroller.isValidDenomination(address(denomination)),
            Errors.Code.IMPLEMENTATION_INVALID_DENOMINATION
        );
        _addAsset(address(denomination));

        // Set approval for investor to redeem
        _setVaultApproval(setupAction);

        // Initialize management fee parameters
        _initializeManagementFee();

        // Initialize performance fee parameters
        _initializePerformanceFee();
    }

    /// @notice Resume the fund by anyone if can settle pending share.
    function resume() external nonReentrant {
        uint256 grossAssetValue = getGrossAssetValue();
        _resumeWithGrossAssetValue(grossAssetValue);
    }

    function _resumeWithGrossAssetValue(uint256 grossAssetValue_) internal returns (uint256 totalRedemption) {
        _whenState(State.Pending);
        Errors._require(
            _isPendingResolvable(true, grossAssetValue_),
            Errors.Code.IMPLEMENTATION_PENDING_SHARE_NOT_RESOLVABLE
        );
        totalRedemption = _settlePendingShare(true);
        _resume();
    }

    /// @notice Liquidate the fund by anyone and transfer owner to liquidator.
    function liquidate() external nonReentrant {
        Errors._require(pendingStartTime != 0, Errors.Code.IMPLEMENTATION_PENDING_NOT_START);
        Errors._require(
            block.timestamp >= pendingStartTime + comptroller.pendingExpiration(),
            Errors.Code.IMPLEMENTATION_PENDING_NOT_EXPIRE
        );

        _liquidate();

        mortgageVault.claim(comptroller.owner());
        _transferOwnership(comptroller.pendingLiquidator());
    }

    /// @notice Close the fund. The pending share will be settled
    /// without penalty.
    function close() public override onlyOwner nonReentrant {
        _whenStates(State.Executing, State.Liquidating);
        if (_getResolvePendingShare(false) > 0) {
            _settlePendingShare(false);
        }

        super.close();

        mortgageVault.claim(msg.sender);
    }

    /////////////////////////////////////////////////////
    // Setters
    /////////////////////////////////////////////////////
    /// @notice Set management fee rate only during reviewing.
    function setManagementFeeRate(uint256 mFeeRate_) external onlyOwner {
        _whenState(State.Reviewing);
        _setManagementFeeRate(mFeeRate_);
    }

    /// @notice Set performance fee rate only during reviewing.
    function setPerformanceFeeRate(uint256 pFeeRate_) external onlyOwner {
        _whenState(State.Reviewing);
        _setPerformanceFeeRate(pFeeRate_);
    }

    /// @notice Set crystallization period only during reviewing.
    function setCrystallizationPeriod(uint256 crystallizationPeriod_) external onlyOwner {
        _whenState(State.Reviewing);
        _setCrystallizationPeriod(crystallizationPeriod_);
    }

    /// @notice Set reserve rate only during reviewing.
    function setReserveExecutionRate(uint256 reserve_) external onlyOwner {
        _whenState(State.Reviewing);
        _setReserveExecutionRate(reserve_);
    }

    /////////////////////////////////////////////////////
    // Getters
    /////////////////////////////////////////////////////
    function getGrossAssetValue() public view virtual returns (uint256) {
        address[] memory assets = getAssetList();
        uint256 length = assets.length;
        uint256[] memory amounts = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            amounts[i] = IERC20(assets[i]).balanceOf(address(vault));
        }

        return comptroller.assetRouter().calcAssetsTotalValue(assets, amounts, address(denomination));
    }

    function __getGrossAssetValue() internal view override(ShareModule, PerformanceFeeModule) returns (uint256) {
        return getGrossAssetValue();
    }

    /// @notice Get the current reserve amount of the fund.
    /// @return The reserve amount.
    function __getReserve() internal view override returns (uint256) {
        return getReserve();
    }

    /////////////////////////////////////////////////////
    // Asset Module
    /////////////////////////////////////////////////////
    /// @notice Add the asset to the tracking list by owner.
    /// @param asset_ The asset to be added.
    function addAsset(address asset_) external nonReentrant onlyOwner {
        _addAsset(asset_);
    }

    /// @notice Add the asset to the tracking list.
    /// @param asset_ The asset to be added.
    function _addAsset(address asset_) internal override {
        Errors._require(comptroller.isValidDealingAsset(level, asset_), Errors.Code.IMPLEMENTATION_INVALID_ASSET);

        if (asset_ == address(denomination)) {
            super._addAsset(asset_);
        } else {
            int256 value = getAssetValue(asset_);
            int256 dust = int256(comptroller.getDenominationDust(address(denomination)));

            if (value >= dust || value < 0) {
                super._addAsset(asset_);
            }
        }
    }

    /// @notice Remove the asset from the tracking list by owner.
    /// @param asset_ The asset to be removed.
    function removeAsset(address asset_) external nonReentrant onlyOwner {
        _removeAsset(asset_);
    }

    /// @notice Remove the asset from the tracking list.
    /// @param asset_ The asset to be removed.
    function _removeAsset(address asset_) internal override {
        // Do not allow to remove denomination from list
        address _denomination = address(denomination);
        if (asset_ != _denomination) {
            int256 value = getAssetValue(asset_);
            int256 dust = int256(comptroller.getDenominationDust(_denomination));

            if (value < dust && value >= 0) {
                super._removeAsset(asset_);
            }
        }
    }

    /// @notice Get the value of a give asset.
    /// @param asset_ The asset to be queried.
    function getAssetValue(address asset_) public view returns (int256) {
        uint256 balance = IERC20(asset_).balanceOf(address(vault));
        if (balance == 0) return 0;

        return comptroller.assetRouter().calcAssetValue(asset_, balance, address(denomination));
    }

    /////////////////////////////////////////////////////
    // Execution module
    /////////////////////////////////////////////////////
    function execute(bytes calldata data_) public override nonReentrant onlyOwner {
        super.execute(data_);
    }

    function _isReserveEnough(uint256 grossAssetValue_) internal view returns (bool) {
        uint256 reserveRate = (getReserve() * _FUND_PERCENTAGE_BASE) / grossAssetValue_;

        return reserveRate >= reserveExecutionRate;
    }

    function _isAfterValueEnough(uint256 prevAssetValue_, uint256 grossAssetValue_) internal view returns (bool) {
        uint256 minGrossAssetValue = (prevAssetValue_ * comptroller.execAssetValueToleranceRate()) /
            _FUND_PERCENTAGE_BASE;

        return grossAssetValue_ >= minGrossAssetValue;
    }

    /// @notice Execute an action on the fund's behalf.
    function _beforeExecute() internal virtual override returns (uint256) {
        return getGrossAssetValue();
    }

    /// @notice Check the reserve after the execution.
    function _afterExecute(bytes memory response_, uint256 prevGrossAssetValue_) internal override returns (uint256) {
        // remove asset from assetList
        address[] memory assetList = getAssetList();
        for (uint256 i = 0; i < assetList.length; ++i) {
            _removeAsset(assetList[i]);
        }

        // add new asset to assetList
        address[] memory dealingAssets = abi.decode(response_, (address[]));

        for (uint256 i = 0; i < dealingAssets.length; ++i) {
            _addAsset(dealingAssets[i]);
        }

        // Get new gross asset value
        uint256 grossAssetValue = getGrossAssetValue();

        Errors._require(
            _isAfterValueEnough(prevGrossAssetValue_, grossAssetValue),
            Errors.Code.IMPLEMENTATION_INSUFFICIENT_TOTAL_VALUE_FOR_EXECUTION
        );

        if (state == State.Pending) {
            uint256 totalRedemption = _resumeWithGrossAssetValue(grossAssetValue);
            // minus redeemed denomination amount
            grossAssetValue -= totalRedemption;
        }

        // Check value after execution
        Errors._require(_isReserveEnough(grossAssetValue), Errors.Code.IMPLEMENTATION_INSUFFICIENT_RESERVE);

        return grossAssetValue;
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
    // Performance fee module
    /////////////////////////////////////////////////////
    /// @notice Crystallize should only be triggered by owner
    function crystallize() public override nonReentrant onlyOwner returns (uint256) {
        return super.crystallize();
    }

    /////////////////////////////////////////////////////
    // Share module
    /////////////////////////////////////////////////////
    /// @notice Update the management fee and performance fee before purchase
    /// to get the lastest share price.
    function _beforePurchase() internal override returns (uint256) {
        uint256 grossAssetValue = getGrossAssetValue();
        _updateManagementFee();
        _updatePerformanceFee(grossAssetValue);
        return grossAssetValue;
    }

    /// @notice Update the gross share price after the purchase.
    function _afterPurchase(uint256 grossAssetValue_) internal override {
        _updateGrossSharePrice(grossAssetValue_);
        if (state == State.Pending && _isPendingResolvable(true, grossAssetValue_)) {
            _settlePendingShare(true);
            _resume();
        }
        return;
    }

    /// @notice Update the management fee and performance fee before redeem
    /// to get the latest share price.
    function _beforeRedeem() internal override returns (uint256) {
        uint256 grossAssetValue = getGrossAssetValue();
        _updateManagementFee();
        _updatePerformanceFee(grossAssetValue);
        return grossAssetValue;
    }

    /// @notice Payout the performance fee for the redempt portion and update
    /// the gross share price.
    function _afterRedeem(uint256 grossAssetValue_) internal override {
        _updateGrossSharePrice(grossAssetValue_);
        return;
    }
}
