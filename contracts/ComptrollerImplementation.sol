// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

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

    struct MortgageTierConfig {
        bool isSet;
        uint256 amount;
    }

    // Variable
    bool public fHalt;
    bool public fInitialAssetCheck;
    address public execAction;
    address public execFeeCollector;
    uint256 public execFeePercentage;
    uint256 public execAssetValueToleranceRate;
    address public pendingLiquidator;
    uint256 public pendingExpiration;
    uint256 public pendingPenalty;
    uint256 public assetCapacity;
    IAssetRouter public assetRouter;
    IMortgageVault public mortgageVault;
    UpgradeableBeacon public beacon;

    // Map
    mapping(address => DenominationConfig) public denomination;
    mapping(address => bool) public bannedFundProxy;
    mapping(uint256 => MortgageTierConfig) public mortgageTier;

    // ACL
    Whitelist.CreatorWList private _creatorACL;
    Whitelist.AssetWList private _assetACL;
    Whitelist.ActionWList private _delegateCallACL;
    Whitelist.ActionWList private _contractCallACL;
    Whitelist.ActionWList private _handlerCallACL;

    // Event
    event Halted();
    event UnHalted();
    event SetMortgageVault(address indexed mortgageVault);
    event SetExecFeeCollector(address indexed collector);
    event SetExecFeePercentage(uint256 indexed percentage);
    event SetPendingLiquidator(address indexed liquidator);
    event SetPendingExpiration(uint256 expiration);
    event SetPendingPenalty(uint256 penalty);
    event SetExecAssetValueToleranceRate(uint256 tolerance);
    event SetInitialAssetCheck(bool indexed check);
    event FundProxyBanned(address indexed fundProxy);
    event FundProxyUnbanned(address indexed fundProxy);
    event PermitDenomination(address indexed denomination, uint256 dust);
    event ForbidDenomination(address indexed denomination);
    event SetMortgageTier(uint256 indexed level, uint256 amount);
    event UnsetMortgageTier(uint256 indexed level);
    event SetAssetCapacity(uint256 indexed assetCapacity);
    event SetAssetRouter(address indexed assetRouter);
    event SetExecAction(address indexed action);
    event PermitCreator(address indexed to);
    event ForbidCreator(address indexed to);
    event PermitAsset(uint256 indexed level, address indexed asset);
    event ForbidAsset(uint256 indexed level, address indexed asset);
    event PermitDelegateCall(uint256 indexed level, address indexed to, bytes4 sig);
    event ForbidDelegateCall(uint256 indexed level, address indexed to, bytes4 sig);
    event PermitContractCall(uint256 indexed level, address indexed to, bytes4 sig);
    event ForbidContractCall(uint256 indexed level, address indexed to, bytes4 sig);
    event PermitHandler(uint256 indexed level, address indexed to, bytes4 sig);
    event ForbidHandler(uint256 indexed level, address indexed to, bytes4 sig);

    // Modifier
    modifier onlyUnHalted() {
        Errors._require(!fHalt, Errors.Code.COMPTROLLER_HALTED);
        _;
    }

    modifier onlyUnbannedFundProxy() {
        Errors._require(!bannedFundProxy[msg.sender], Errors.Code.COMPTROLLER_BANNED);
        _;
    }

    modifier nonZeroAddress(address newSetter_) {
        Errors._require(newSetter_ != address(0), Errors.Code.COMPTROLLER_ZERO_ADDRESS);
        _;
    }

    modifier consistentTosAndSigsLength(address[] calldata tos_, bytes4[] calldata sigs_) {
        Errors._require(tos_.length == sigs_.length, Errors.Code.COMPTROLLER_TOS_AND_SIGS_LENGTH_INCONSISTENT);
        _;
    }

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
        Errors._require(address(beacon) == address(0), Errors.Code.COMPTROLLER_BEACON_IS_INITIALIZED);
        // transfer owner for set functions
        _transferOwnership(msg.sender);
        setAssetRouter(assetRouter_);
        setMortgageVault(mortgageVault_);
        setFeeCollector(execFeeCollector_);
        setExecFeePercentage(execFeePercentage_);
        setPendingLiquidator(pendingLiquidator_);
        setPendingExpiration(pendingExpiration_);
        setPendingPenalty(100);
        setAssetCapacity(80);
        setExecAssetValueToleranceRate(execAssetValueToleranceRate_);
        setInitialAssetCheck(true);
        beacon = new UpgradeableBeacon(implementation_);
        beacon.transferOwnership(msg.sender);
    }

    function implementation() external view onlyUnHalted onlyUnbannedFundProxy returns (address) {
        return beacon.implementation();
    }

    function owner() public view override(Ownable, IComptroller) returns (address) {
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

    // Asset router
    function setAssetRouter(IAssetRouter assetRouter_) public nonZeroAddress(address(assetRouter_)) onlyOwner {
        assetRouter = assetRouter_;
        emit SetAssetRouter(address(assetRouter_));
    }

    // Mortgage Vault
    function setMortgageVault(IMortgageVault mortgageVault_) public nonZeroAddress(address(mortgageVault_)) onlyOwner {
        mortgageVault = mortgageVault_;
        emit SetMortgageVault(address(mortgageVault_));
    }

    // Fee
    function setFeeCollector(address collector_) public nonZeroAddress(collector_) onlyOwner {
        execFeeCollector = collector_;
        emit SetExecFeeCollector(collector_);
    }

    function setExecFeePercentage(uint256 percentage_) public onlyOwner {
        execFeePercentage = percentage_;
        emit SetExecFeePercentage(percentage_);
    }

    // Pending
    function setPendingLiquidator(address liquidator_) public nonZeroAddress(liquidator_) onlyOwner {
        pendingLiquidator = liquidator_;
        emit SetPendingLiquidator(liquidator_);
    }

    function setPendingExpiration(uint256 expiration_) public onlyOwner {
        pendingExpiration = expiration_;
        emit SetPendingExpiration(expiration_);
    }

    // Share
    function setPendingPenalty(uint256 penalty_) public onlyOwner {
        pendingPenalty = penalty_;
        emit SetPendingPenalty(penalty_);
    }

    // Maximum kinds of asset
    function setAssetCapacity(uint256 assetCapacity_) public onlyOwner {
        assetCapacity = assetCapacity_;
        emit SetAssetCapacity(assetCapacity_);
    }

    // Execution asset value tolerance
    function setExecAssetValueToleranceRate(uint256 tolerance_) public onlyOwner {
        execAssetValueToleranceRate = tolerance_;
        emit SetExecAssetValueToleranceRate(tolerance_);
    }

    // Initial asset check
    function setInitialAssetCheck(bool check_) public onlyOwner {
        fInitialAssetCheck = check_;
        emit SetInitialAssetCheck(check_);
    }

    // Denomination whitelist
    function permitDenominations(address[] calldata denominations_, uint256[] calldata dusts_) external onlyOwner {
        Errors._require(
            denominations_.length == dusts_.length,
            Errors.Code.COMPTROLLER_DENOMINATIONS_AND_DUSTS_LENGTH_INCONSISTENT
        );

        for (uint256 i = 0; i < denominations_.length; i++) {
            denomination[denominations_[i]].isPermitted = true;
            denomination[denominations_[i]].dust = dusts_[i];
            emit PermitDenomination(denominations_[i], dusts_[i]);
        }
    }

    function forbidDenominations(address[] calldata denominations_) external onlyOwner {
        for (uint256 i = 0; i < denominations_.length; i++) {
            delete denomination[denominations_[i]];
            emit ForbidDenomination(denominations_[i]);
        }
    }

    function isValidDenomination(address denomination_) external view returns (bool) {
        return denomination[denomination_].isPermitted;
    }

    function getDenominationDust(address denomination_) external view returns (uint256) {
        return denomination[denomination_].dust;
    }

    // Ban fund proxy
    function banFundProxy(address fundProxy_) external onlyOwner {
        bannedFundProxy[fundProxy_] = true;
        emit FundProxyBanned(fundProxy_);
    }

    function unbanFundProxy(address fundProxy_) external onlyOwner {
        bannedFundProxy[fundProxy_] = false;
        emit FundProxyUnbanned(fundProxy_);
    }

    // Mortgage tier amount
    function setMortgageTier(uint256 level_, uint256 amount_) external onlyOwner {
        mortgageTier[level_].isSet = true;
        mortgageTier[level_].amount = amount_;
        emit SetMortgageTier(level_, amount_);
    }

    function unsetMortgageTier(uint256 level_) external onlyOwner {
        delete mortgageTier[level_];
        emit UnsetMortgageTier(level_);
    }

    // Action
    function setExecAction(address action_) external nonZeroAddress(action_) onlyOwner {
        execAction = action_;
        emit SetExecAction(action_);
    }

    // Creator whitelist
    function permitCreators(address[] calldata creators_) external onlyOwner {
        for (uint256 i = 0; i < creators_.length; i++) {
            _creatorACL._permit(creators_[i]);
            emit PermitCreator(creators_[i]);
        }
    }

    function forbidCreators(address[] calldata creators_) external onlyOwner {
        for (uint256 i = 0; i < creators_.length; i++) {
            _creatorACL._forbid(creators_[i]);
            emit ForbidCreator(creators_[i]);
        }
    }

    function isValidCreator(address creator_) external view returns (bool) {
        return _creatorACL._canCall(creator_);
    }

    // Asset whitelist
    function permitAssets(uint256 level_, address[] calldata assets_) external onlyOwner {
        for (uint256 i = 0; i < assets_.length; i++) {
            _assetACL._permit(level_, assets_[i]);
            emit PermitAsset(level_, assets_[i]);
        }
    }

    function forbidAssets(uint256 level_, address[] calldata assets_) external onlyOwner {
        for (uint256 i = 0; i < assets_.length; i++) {
            _assetACL._forbid(level_, assets_[i]);
            emit ForbidAsset(level_, assets_[i]);
        }
    }

    function isValidDealingAssets(uint256 level_, address[] calldata assets_) external view returns (bool) {
        for (uint256 i = 0; i < assets_.length; i++) {
            if (!isValidDealingAsset(level_, assets_[i])) {
                return false;
            }
        }
        return true;
    }

    function isValidDealingAsset(uint256 level_, address asset_) public view returns (bool) {
        return _assetACL._canCall(level_, asset_);
    }

    function isValidInitialAssets(uint256 level_, address[] calldata assets_) external view returns (bool) {
        for (uint256 i = 0; i < assets_.length; i++) {
            if (!isValidInitialAsset(level_, assets_[i])) {
                return false;
            }
        }
        return true;
    }

    function isValidInitialAsset(uint256 level_, address asset_) public view returns (bool) {
        // check if input check flag is true
        if (fInitialAssetCheck) {
            return _assetACL._canCall(level_, asset_);
        }
        return true;
    }

    // DelegateCall whitelist function
    function canDelegateCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _delegateCallACL._canCall(level_, to_, sig_);
    }

    function permitDelegateCalls(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _delegateCallACL._permit(level_, tos_[i], sigs_[i]);
            emit PermitDelegateCall(level_, tos_[i], sigs_[i]);
        }
    }

    function forbidDelegateCalls(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _delegateCallACL._forbid(level_, tos_[i], sigs_[i]);
            emit ForbidDelegateCall(level_, tos_[i], sigs_[i]);
        }
    }

    // Contract call whitelist function
    function permitContractCalls(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _contractCallACL._permit(level_, tos_[i], sigs_[i]);
            emit PermitContractCall(level_, tos_[i], sigs_[i]);
        }
    }

    function forbidContractCalls(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _contractCallACL._forbid(level_, tos_[i], sigs_[i]);
            emit ForbidContractCall(level_, tos_[i], sigs_[i]);
        }
    }

    function canContractCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _contractCallACL._canCall(level_, to_, sig_);
    }

    // Handler whitelist function
    function permitHandlers(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _handlerCallACL._permit(level_, tos_[i], sigs_[i]);
            emit PermitHandler(level_, tos_[i], sigs_[i]);
        }
    }

    function forbidHandlers(
        uint256 level_,
        address[] calldata tos_,
        bytes4[] calldata sigs_
    ) external consistentTosAndSigsLength(tos_, sigs_) onlyOwner {
        for (uint256 i = 0; i < tos_.length; i++) {
            _handlerCallACL._forbid(level_, tos_[i], sigs_[i]);
            emit ForbidHandler(level_, tos_[i], sigs_[i]);
        }
    }

    function canHandlerCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _handlerCallACL._canCall(level_, to_, sig_);
    }
}
