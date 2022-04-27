// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAssetRouter} from "../assets/interfaces/IAssetRouter.sol";
import {IMortgageVault} from "./IMortgageVault.sol";

interface IComptroller {
    function owner() external view returns (address);

    function canDelegateCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool);

    function canContractCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool);

    function canHandlerCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool);

    function execFeePercentage() external view returns (uint256);

    function execFeeCollector() external view returns (address);

    function pendingLiquidator() external view returns (address);

    function pendingExpiration() external view returns (uint256);

    function execAssetValueToleranceRate() external view returns (uint256);

    function isValidDealingAsset(uint256 level_, address asset_) external view returns (bool);

    function isValidDealingAssets(uint256 level_, address[] calldata assets_) external view returns (bool);

    function isValidInitialAssets(uint256 level_, address[] calldata assets_) external view returns (bool);

    function assetCapacity() external view returns (uint256);

    function assetRouter() external view returns (IAssetRouter);

    function mortgageVault() external view returns (IMortgageVault);

    function pendingPenalty() external view returns (uint256);

    function execAction() external view returns (address);

    function mortgageTier(uint256 tier_) external view returns (bool, uint256);

    function isValidDenomination(address denomination_) external view returns (bool);

    function getDenominationDust(address denomination_) external view returns (uint256);

    function isValidCreator(address creator_) external view returns (bool);
}
