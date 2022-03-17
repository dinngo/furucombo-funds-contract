// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAssetRouter} from "../assets/interfaces/IAssetRouter.sol";
import {IMortgageVault} from "./IMortgageVault.sol";

interface IComptroller {
    function owner() external view returns (address);

    function canDelegateCall(
        uint256 level,
        address _to,
        bytes4 sig
    ) external view returns (bool);

    function canContractCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool);

    function canHandlerCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool);

    function execFeePercentage() external view returns (uint256);

    function execFeeCollector() external view returns (address);

    function pendingLiquidator() external view returns (address);

    function pendingExpiration() external view returns (uint256);

    function execAssetValueToleranceRate() external view returns (uint256);

    function isValidDealingAsset(uint256 level, address asset)
        external
        view
        returns (bool);

    function isValidDealingAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool);

    function isValidInitialAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool);

    function assetRouter() external view returns (IAssetRouter);

    function mortgageVault() external view returns (IMortgageVault);

    function pendingRedemptionPenalty() external view returns (uint256);

    function execAction() external view returns (address);

    function stakedTier(uint256 tier) external view returns (uint256);

    function isValidDenomination(address _denomination)
        external
        view
        returns (bool);

    function getDenominationDust(address _denomination)
        external
        view
        returns (uint256);

    function isValidCreator(address creator) external view returns (bool);
}
