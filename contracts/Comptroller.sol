// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Whitelist} from "./libraries/Whitelist.sol";

contract Comptroller is UpgradeableBeacon {
    // TODO: optimization data storage
    using Whitelist for Whitelist.ActionWList;
    using Whitelist for Whitelist.AssetWList;
    using Whitelist for Whitelist.ManagerWList;

    // Variable
    bool public fHalt;
    bool public fInitialAssetCheck;
    address public assetRouter;
    address public execAction;
    address public setupAction;
    address public execFeeCollector;
    uint256 public execFeePercentage;

    // Map
    mapping(address => bool) public denomination;
    mapping(address => bool) public bannedProxy;
    mapping(uint256 => uint256) public stakedTier;

    // ACL
    Whitelist.ManagerWList private managerACL;
    Whitelist.AssetWList private assetACL;
    Whitelist.ActionWList private delegateCallACL;
    Whitelist.ActionWList private contractCallACL;
    Whitelist.ActionWList private handlerCallACL;

    // Event
    event Halted();
    event UnHalted();
    event SetExecFeeCollector(address indexed collector);
    event SetExecFeePercentage(uint256 indexed percentage);
    event SetInitialAssetCheck(bool indexed check);
    event ProxyBanned(address indexed proxy);
    event ProxyUnbanned(address indexed proxy);
    event PermitDenomination(address indexed denomination);
    event ForbidDenomination(address indexed denomination);
    event SetStakedTier(uint256 indexed level, uint256 amount);
    event SetAssetRouter(address indexed assetRouter);
    event SetExecAction(address indexed action);
    event SetSetupAction(address indexed action);
    event PermitManager(address indexed to);
    event ForbidManager(address indexed to);
    event PermitAsset(uint256 indexed level, address assets);
    event ForbidAsset(uint256 indexed level, address assets);
    event PermitDelegateCall(uint256 indexed level, address to, bytes4 sig);
    event ForbidDelegateCall(uint256 indexed level, address to, bytes4 sig);
    event PermitContractCall(uint256 indexed level, address to, bytes4 sig);
    event ForbidContractCall(uint256 indexed level, address to, bytes4 sig);
    event PermitHandler(uint256 indexed level, address to, bytes4 sig);
    event ForbidHandler(uint256 indexed level, address to, bytes4 sig);

    // Modifier
    modifier onlyUnHalted() {
        require(!fHalt, "Halted");
        _;
    }

    modifier onlyUnbannedProxy() {
        require(!bannedProxy[msg.sender], "Banned");
        _;
    }

    // Public Function
    constructor(
        address implementation_,
        address assetRouter_,
        address execFeeCollector_
    ) UpgradeableBeacon(implementation_) {
        assetRouter = assetRouter_;
        execFeeCollector = execFeeCollector_;
        fInitialAssetCheck = true;
        this;
    }

    function implementation()
        public
        view
        override
        onlyUnHalted
        onlyUnbannedProxy
        returns (address)
    {
        return UpgradeableBeacon.implementation();
    }

    // Halt
    function halt() external onlyOwner {
        fHalt = true;
        emit Halted();
    }

    function unHalt() external onlyOwner {
        fHalt = false;
        emit UnHalted();
    }

    // Fee
    function setFeeCollector(address collector) external onlyOwner {
        execFeeCollector = collector;
        emit SetExecFeeCollector(collector);
    }

    function setExecFeePercentage(uint256 percentage) external onlyOwner {
        execFeePercentage = percentage;
        emit SetExecFeePercentage(execFeePercentage);
    }

    // input check
    function setInitialAssetCheck(bool check) external onlyOwner {
        fInitialAssetCheck = check;
        emit SetInitialAssetCheck(check);
    }

    // Denomination whitelist
    function permitDenominations(address[] calldata denominations)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < denominations.length; i++) {
            denomination[denominations[i]] = true;
            emit PermitDenomination(denominations[i]);
        }
    }

    function forbidDenominations(address[] calldata denominations)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < denominations.length; i++) {
            denomination[denominations[i]] = false;
            emit ForbidDenomination(denominations[i]);
        }
    }

    // Ban Proxy
    function banProxy(address proxy) external onlyOwner {
        bannedProxy[proxy] = true;
        emit ProxyBanned(proxy);
    }

    function unBanProxy(address proxy) external onlyOwner {
        bannedProxy[proxy] = false;
        emit ProxyUnbanned(proxy);
    }

    // Stake tier amount
    function setStakedTier(uint256 level, uint256 amount) external onlyOwner {
        stakedTier[level] = amount;
        emit SetStakedTier(level, amount);
    }

    // Asset Router
    function setAssetRouter(address _assetRouter) external onlyOwner {
        // TODO: non 0x00000 and 0xeeee
        assetRouter = _assetRouter;
        emit SetAssetRouter(_assetRouter);
    }

    // Action
    function setExecAction(address action) external onlyOwner {
        execAction = action;
        emit SetExecAction(action);
    }

    function setSetupAction(address action) external onlyOwner {
        setupAction = action;
        emit SetSetupAction(action);
    }

    // Manager whitelist
    function permitManagers(address[] calldata managers) external onlyOwner {
        for (uint256 i = 0; i < managers.length; i++) {
            managerACL.permit(managers[i]);
            emit PermitManager(managers[i]);
        }
    }

    function forbidManagers(address[] calldata managers) external onlyOwner {
        for (uint256 i = 0; i < managers.length; i++) {
            managerACL.forbid(managers[i]);
            emit ForbidManager(managers[i]);
        }
    }

    function validManager(address manager) external view returns (bool) {
        return managerACL.canCall(manager);
    }

    // Asset whitelist
    function permitAssets(uint256 level, address[] calldata assets)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < assets.length; i++) {
            assetACL.permit(level, assets[i]);
            emit PermitAsset(level, assets[i]);
        }
    }

    function forbidAssets(uint256 level, address[] calldata assets)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < assets.length; i++) {
            assetACL.forbid(level, assets[i]);
            emit ForbidAsset(level, assets[i]);
        }
    }

    function validateDealingAsset(uint256 level, address asset)
        public
        view
        returns (bool)
    {
        return assetACL.canCall(level, asset);
    }

    function validateDealingAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool)
    {
        for (uint256 i = 0; i < assets.length; i++) {
            if (!validateDealingAsset(level, assets[i])) {
                return false;
            }
        }
        return true;
    }

    function validateInitialAsset(uint256 level, address asset)
        public
        view
        returns (bool)
    {
        // check if input check flag is true
        if (fInitialAssetCheck) {
            return assetACL.canCall(level, asset);
        }
        return true;
    }

    function validateInitialAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool)
    {
        for (uint256 i = 0; i < assets.length; i++) {
            if (!validateInitialAsset(level, assets[i])) {
                return false;
            }
        }
        return true;
    }

    // DelegateCall whitelist function
    function canDelegateCall(
        uint256 level,
        address _to,
        bytes4 sig
    ) external view returns (bool) {
        return delegateCallACL.canCall(level, _to, sig);
    }

    function permitDelegateCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            delegateCallACL.permit(level, tos[i], sigs[i]);
            emit PermitDelegateCall(level, tos[i], sigs[i]);
        }
    }

    function forbidDelegateCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            delegateCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidDelegateCall(level, tos[i], sigs[i]);
        }
    }

    // Contract call whitelist function
    function permitContractCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            contractCallACL.permit(level, tos[i], sigs[i]);
            emit PermitContractCall(level, tos[i], sigs[i]);
        }
    }

    function forbidContractCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            contractCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidContractCall(level, tos[i], sigs[i]);
        }
    }

    function canContractCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool) {
        return contractCallACL.canCall(level, to, sig);
    }

    // Handler whitelist function
    function permitHandlers(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            handlerCallACL.permit(level, tos[i], sigs[i]);
            emit PermitHandler(level, tos[i], sigs[i]);
        }
    }

    function forbidHandlers(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external onlyOwner {
        require(tos.length == sigs.length, "valid length");
        for (uint256 i = 0; i < tos.length; i++) {
            handlerCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidHandler(level, tos[i], sigs[i]);
        }
    }

    function canHandlerCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool) {
        return handlerCallACL.canCall(level, to, sig);
    }
}
