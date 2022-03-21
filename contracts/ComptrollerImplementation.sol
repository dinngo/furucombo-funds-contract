// SPDX-License-Identifier: MIT
pragma solidity 0.8.12;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Whitelist} from "./libraries/Whitelist.sol";
import {IAssetRouter} from "./assets/interfaces/IAssetRouter.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";
import {Errors} from "./utils/Errors.sol";

contract ComptrollerImplementation is Ownable, IComptroller {
    using Whitelist for Whitelist.ActionWList;
    using Whitelist for Whitelist.AssetWList;
    using Whitelist for Whitelist.CreatorWList;

    // Struct
    struct DenominationConfig {
        bool isPermitted;
        uint256 dust;
    }

    // Variable
    bool public fHalt;
    bool public fInitialAssetCheck;
    address public execAction;
    address public execFeeCollector;
    uint256 public execFeePercentage;
    address public pendingLiquidator;
    uint256 public pendingExpiration;
    uint256 public pendingRedemptionPenalty;
    // base = 1e4
    uint256 public execAssetValueToleranceRate;
    IAssetRouter public assetRouter;
    IMortgageVault public mortgageVault;
    UpgradeableBeacon public beacon;

    // Map
    mapping(address => DenominationConfig) public denomination;
    mapping(address => bool) public bannedPoolProxy;
    mapping(uint256 => uint256) public stakedTier;

    // ACL
    Whitelist.CreatorWList private _creatorACL;
    Whitelist.AssetWList private _assetACL;
    Whitelist.ActionWList private _delegateCallACL;
    Whitelist.ActionWList private _contractCallACL;
    Whitelist.ActionWList private _handlerCallACL;

    // Event
    event Halted();
    event UnHalted();
    event SetExecFeeCollector(address indexed collector);
    event SetExecFeePercentage(uint256 indexed percentage);
    event SetPendingLiquidator(address indexed liquidator);
    event SetPendingExpiration(uint256 expiration);
    event SetExecAssetValuetoleranceRate(uint256 tolerance);
    event SetInitialAssetCheck(bool indexed check);
    event PoolProxyBanned(address indexed poolProxy);
    event PoolProxyUnbanned(address indexed poolProxy);
    event PermitDenomination(address indexed denomination, uint256 dust);
    event ForbidDenomination(address indexed denomination);
    event SetDenominationDust(uint256 amount);
    event SetStakedTier(uint256 indexed level, uint256 amount);
    event SetAssetRouter(address indexed assetRouter);
    event SetExecAction(address indexed action);
    event PermitCreator(address indexed to);
    event ForbidCreator(address indexed to);
    event PermitAsset(uint256 indexed level, address indexed asset);
    event ForbidAsset(uint256 indexed level, address indexed asset);
    event PermitDelegateCall(
        uint256 indexed level,
        address indexed to,
        bytes4 sig
    );
    event ForbidDelegateCall(
        uint256 indexed level,
        address indexed to,
        bytes4 sig
    );
    event PermitContractCall(
        uint256 indexed level,
        address indexed to,
        bytes4 sig
    );
    event ForbidContractCall(
        uint256 indexed level,
        address indexed to,
        bytes4 sig
    );
    event PermitHandler(uint256 indexed level, address indexed to, bytes4 sig);
    event ForbidHandler(uint256 indexed level, address indexed to, bytes4 sig);

    // Modifier
    modifier onlyUnHalted() {
        Errors._require(!fHalt, Errors.Code.COMPTROLLER_HALTED);
        _;
    }

    modifier onlyUnbannedPoolProxy() {
        Errors._require(
            !bannedPoolProxy[msg.sender],
            Errors.Code.COMPTROLLER_BANNED
        );
        _;
    }

    modifier nonZeroAddress(address newSetter) {
        Errors._require(
            newSetter != address(0),
            Errors.Code.COMPTROLLER_ZERO_ADDRESS
        );
        _;
    }

    modifier consistentTosAndSigsLength(
        address[] calldata tos,
        bytes4[] calldata sigs
    ) {
        Errors._require(
            tos.length == sigs.length,
            Errors.Code.COMPTROLLER_TOS_AND_SIGS_LENGTH_INCONSISTENT
        );
        _;
    }

    // Public Function
    function initialize(
        address implementation_,
        IAssetRouter assetRouter_,
        address execFeeCollector_,
        uint256 execFeePercentage_,
        address pendingLiquidator_,
        uint256 pendingExpiration_,
        IMortgageVault mortgageVault_,
        uint256 execAssetValueToleranceRate_
    ) external {
        require(address(beacon) == address(0));
        assetRouter = assetRouter_;
        mortgageVault = mortgageVault_;
        execFeeCollector = execFeeCollector_;
        execFeePercentage = execFeePercentage_;
        pendingLiquidator = pendingLiquidator_;
        pendingExpiration = pendingExpiration_;
        execAssetValueToleranceRate = execAssetValueToleranceRate_;
        fInitialAssetCheck = true;
        pendingRedemptionPenalty = 100;
        _transferOwnership(msg.sender);
        beacon = new UpgradeableBeacon(implementation_);
        beacon.transferOwnership(msg.sender);
    }

    function implementation()
        public
        view
        onlyUnHalted
        onlyUnbannedPoolProxy
        returns (address)
    {
        return beacon.implementation();
    }

    function owner()
        public
        view
        override(Ownable, IComptroller)
        returns (address)
    {
        return Ownable.owner();
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
    function setFeeCollector(address collector)
        external
        nonZeroAddress(collector)
        onlyOwner
    {
        execFeeCollector = collector;
        emit SetExecFeeCollector(collector);
    }

    function setExecFeePercentage(uint256 percentage) external onlyOwner {
        execFeePercentage = percentage;
        emit SetExecFeePercentage(execFeePercentage);
    }

    // Pending redemption
    function setPendingLiquidator(address liquidator)
        external
        nonZeroAddress(liquidator)
        onlyOwner
    {
        pendingLiquidator = liquidator;
        emit SetPendingLiquidator(liquidator);
    }

    function setPendingExpiration(uint256 expiration) external onlyOwner {
        pendingExpiration = expiration;
        emit SetPendingExpiration(expiration);
    }

    // Share
    // Notice that the penalty's base is 1e4
    function setPendingRedemptionPenalty(uint256 penalty) external onlyOwner {
        pendingRedemptionPenalty = penalty;
    }

    // Execution asset value tolerance
    function setExecAssetValueToleranceRate(uint256 tolerance)
        external
        onlyOwner
    {
        execAssetValueToleranceRate = tolerance;
        emit SetExecAssetValuetoleranceRate(tolerance);
    }

    // input check
    function setInitialAssetCheck(bool check) external onlyOwner {
        fInitialAssetCheck = check;
        emit SetInitialAssetCheck(check);
    }

    // Denomination whitelist
    function permitDenominations(
        address[] calldata denominations,
        uint256[] calldata dusts
    ) external onlyOwner {
        Errors._require(
            denominations.length == dusts.length,
            Errors.Code.COMPTROLLER_DENOMINATIONS_AND_DUSTS_LENGTH_INCONSISTENT
        );

        for (uint256 i = 0; i < denominations.length; i++) {
            denomination[denominations[i]].isPermitted = true;
            denomination[denominations[i]].dust = dusts[i];
            emit PermitDenomination(denominations[i], dusts[i]);
        }
    }

    function forbidDenominations(address[] calldata denominations)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < denominations.length; i++) {
            delete denomination[denominations[i]];
            emit ForbidDenomination(denominations[i]);
        }
    }

    function isValidDenomination(address _denomination)
        external
        view
        returns (bool)
    {
        return denomination[_denomination].isPermitted;
    }

    function getDenominationDust(address _denomination)
        external
        view
        returns (uint256)
    {
        return denomination[_denomination].dust;
    }

    // Ban Pool Proxy
    function banPoolProxy(address poolProxy) external onlyOwner {
        bannedPoolProxy[poolProxy] = true;
        emit PoolProxyBanned(poolProxy);
    }

    function unbanPoolProxy(address poolProxy) external onlyOwner {
        bannedPoolProxy[poolProxy] = false;
        emit PoolProxyUnbanned(poolProxy);
    }

    // Stake tier amount
    function setStakedTier(uint256 level, uint256 amount) external onlyOwner {
        stakedTier[level] = amount;
        emit SetStakedTier(level, amount);
    }

    // Asset Router
    function setAssetRouter(IAssetRouter _assetRouter)
        external
        nonZeroAddress(address(_assetRouter))
        onlyOwner
    {
        assetRouter = _assetRouter;
        emit SetAssetRouter(address(_assetRouter));
    }

    // Action
    function setExecAction(address action)
        external
        nonZeroAddress(action)
        onlyOwner
    {
        execAction = action;
        emit SetExecAction(action);
    }

    // Creator whitelist
    function permitCreators(address[] calldata creators) external onlyOwner {
        for (uint256 i = 0; i < creators.length; i++) {
            _creatorACL.permit(creators[i]);
            emit PermitCreator(creators[i]);
        }
    }

    function forbidCreators(address[] calldata creators) external onlyOwner {
        for (uint256 i = 0; i < creators.length; i++) {
            _creatorACL.forbid(creators[i]);
            emit ForbidCreator(creators[i]);
        }
    }

    function isValidCreator(address creator) external view returns (bool) {
        return _creatorACL.canCall(creator);
    }

    // Asset whitelist
    function permitAssets(uint256 level, address[] calldata assets)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < assets.length; i++) {
            _assetACL.permit(level, assets[i]);
            emit PermitAsset(level, assets[i]);
        }
    }

    function forbidAssets(uint256 level, address[] calldata assets)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < assets.length; i++) {
            _assetACL.forbid(level, assets[i]);
            emit ForbidAsset(level, assets[i]);
        }
    }

    function isValidDealingAsset(uint256 level, address asset)
        public
        view
        returns (bool)
    {
        return _assetACL.canCall(level, asset);
    }

    function isValidDealingAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool)
    {
        for (uint256 i = 0; i < assets.length; i++) {
            if (!isValidDealingAsset(level, assets[i])) {
                return false;
            }
        }
        return true;
    }

    function isValidInitialAsset(uint256 level, address asset)
        public
        view
        returns (bool)
    {
        // check if input check flag is true
        if (fInitialAssetCheck) {
            return _assetACL.canCall(level, asset);
        }
        return true;
    }

    function isValidInitialAssets(uint256 level, address[] calldata assets)
        external
        view
        returns (bool)
    {
        for (uint256 i = 0; i < assets.length; i++) {
            if (!isValidInitialAsset(level, assets[i])) {
                return false;
            }
        }
        return true;
    }

    // DelegateCall whitelist function
    function canDelegateCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool) {
        return _delegateCallACL.canCall(level, to, sig);
    }

    function permitDelegateCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _delegateCallACL.permit(level, tos[i], sigs[i]);
            emit PermitDelegateCall(level, tos[i], sigs[i]);
        }
    }

    function forbidDelegateCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _delegateCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidDelegateCall(level, tos[i], sigs[i]);
        }
    }

    // Contract call whitelist function
    function permitContractCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _contractCallACL.permit(level, tos[i], sigs[i]);
            emit PermitContractCall(level, tos[i], sigs[i]);
        }
    }

    function forbidContractCalls(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _contractCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidContractCall(level, tos[i], sigs[i]);
        }
    }

    function canContractCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool) {
        return _contractCallACL.canCall(level, to, sig);
    }

    // Handler whitelist function
    function permitHandlers(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _handlerCallACL.permit(level, tos[i], sigs[i]);
            emit PermitHandler(level, tos[i], sigs[i]);
        }
    }

    function forbidHandlers(
        uint256 level,
        address[] calldata tos,
        bytes4[] calldata sigs
    ) external consistentTosAndSigsLength(tos, sigs) onlyOwner {
        for (uint256 i = 0; i < tos.length; i++) {
            _handlerCallACL.forbid(level, tos[i], sigs[i]);
            emit ForbidHandler(level, tos[i], sigs[i]);
        }
    }

    function canHandlerCall(
        uint256 level,
        address to,
        bytes4 sig
    ) external view returns (bool) {
        return _handlerCallACL.canCall(level, to, sig);
    }
}
