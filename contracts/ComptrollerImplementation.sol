// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Whitelist} from "./libraries/Whitelist.sol";
import {IAssetRouter} from "./assets/interfaces/IAssetRouter.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";
import {IDSProxyRegistry} from "./interfaces/IDSProxy.sol";
import {ISetupAction} from "./interfaces/ISetupAction.sol";
import {Errors} from "./utils/Errors.sol";

/// @title The implementation contract of comptroller
/// @notice Set the parameters and the permission controls of fund.
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
    IDSProxyRegistry public dsProxyRegistry;
    ISetupAction public setupAction;

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
    event SetDSProxyRegistry(address indexed registry);
    event SetSetupAction(address indexed action);
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

    constructor() {
        // set owner to address(0) in implementation contract
        renounceOwnership();
    }

    /// @notice Initializer.
    /// @param implementation_ The fund implementation address.
    /// @param assetRouter_ The asset router address.
    /// @param execFeeCollector_ The execution fee collector address.
    /// @param execFeePercentage_ The ececute fee percentage on a 1e4 basis.
    /// @param pendingLiquidator_ The pending liquidator address.
    /// @param pendingExpiration_ The pending expiration to be set in second.
    /// @param mortgageVault_ The mortgage vault address.
    /// @param execAssetValueToleranceRate_ The exec asset value tolerance rate.
    /// @param dsProxyRegistry_ The DSProxy registry address.
    /// @param setupAction_ The setup action address.
    function initialize(
        address implementation_,
        IAssetRouter assetRouter_,
        address execFeeCollector_,
        uint256 execFeePercentage_,
        address pendingLiquidator_,
        uint256 pendingExpiration_,
        IMortgageVault mortgageVault_,
        uint256 execAssetValueToleranceRate_,
        IDSProxyRegistry dsProxyRegistry_,
        ISetupAction setupAction_
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
        setDSProxyRegistry(dsProxyRegistry_);
        setSetupAction(setupAction_);

        beacon = new UpgradeableBeacon(implementation_);
        beacon.transferOwnership(msg.sender);
    }

    /// @notice Get the implementation address.
    /// @return The implementation address.
    function implementation() external view onlyUnHalted onlyUnbannedFundProxy returns (address) {
        return beacon.implementation();
    }

    /// @inheritdoc IComptroller
    function owner() public view override(Ownable, IComptroller) returns (address) {
        return Ownable.owner();
    }

    /// @notice Halt the fund.
    function halt() external onlyOwner {
        fHalt = true;
        emit Halted();
    }

    /// @notice Unhalt the fund.
    function unHalt() external onlyOwner {
        fHalt = false;
        emit UnHalted();
    }

    /// @notice Set asset router.
    /// @param assetRouter_ The asset router address.
    function setAssetRouter(IAssetRouter assetRouter_) public nonZeroAddress(address(assetRouter_)) onlyOwner {
        assetRouter = assetRouter_;
        emit SetAssetRouter(address(assetRouter_));
    }

    /// @notice Set mortgage vault.
    /// @param mortgageVault_ The mortage vault address.
    function setMortgageVault(IMortgageVault mortgageVault_) public nonZeroAddress(address(mortgageVault_)) onlyOwner {
        mortgageVault = mortgageVault_;
        emit SetMortgageVault(address(mortgageVault_));
    }

    /// @notice Set execution fee collector.
    /// @param collector_ The collector address.
    function setFeeCollector(address collector_) public nonZeroAddress(collector_) onlyOwner {
        execFeeCollector = collector_;
        emit SetExecFeeCollector(collector_);
    }

    /// @notice Set execution fee percentage.
    /// @param percentage_ The fee percentage on a 1e4 basis.
    function setExecFeePercentage(uint256 percentage_) public onlyOwner {
        execFeePercentage = percentage_;
        emit SetExecFeePercentage(percentage_);
    }

    /// @notice Set pending liquidator.
    /// @param liquidator_ The liquidator address.
    function setPendingLiquidator(address liquidator_) public nonZeroAddress(liquidator_) onlyOwner {
        pendingLiquidator = liquidator_;
        emit SetPendingLiquidator(liquidator_);
    }

    /// @notice Set pending expiration.
    /// @param expiration_ The pending expiration to be set in second.
    function setPendingExpiration(uint256 expiration_) public onlyOwner {
        pendingExpiration = expiration_;
        emit SetPendingExpiration(expiration_);
    }

    /// @notice Set pending state redeem penalty.
    /// @param penalty_ The penalty percentage on a 1e4 basis.
    function setPendingPenalty(uint256 penalty_) public onlyOwner {
        pendingPenalty = penalty_;
        emit SetPendingPenalty(penalty_);
    }

    /// @notice Set maximum capacity of assets.
    /// @param assetCapacity_ The number of assets.
    function setAssetCapacity(uint256 assetCapacity_) public onlyOwner {
        assetCapacity = assetCapacity_;
        emit SetAssetCapacity(assetCapacity_);
    }

    /// @notice Set execution asset value tolerance rate.
    /// @param tolerance_ The tolerance rate on a 1e4 basis.
    function setExecAssetValueToleranceRate(uint256 tolerance_) public onlyOwner {
        execAssetValueToleranceRate = tolerance_;
        emit SetExecAssetValueToleranceRate(tolerance_);
    }

    /// @notice Set to check initial asset or not.
    /// @param check_ The boolean of checking initial asset.
    function setInitialAssetCheck(bool check_) public onlyOwner {
        fInitialAssetCheck = check_;
        emit SetInitialAssetCheck(check_);
    }

    /// @notice Set the DSProxy registry.
    /// @param dsProxyRegistry_ The DSProxy Registry address.
    function setDSProxyRegistry(IDSProxyRegistry dsProxyRegistry_)
        public
        nonZeroAddress(address(dsProxyRegistry_))
        onlyOwner
    {
        dsProxyRegistry = dsProxyRegistry_;
        emit SetDSProxyRegistry(address(dsProxyRegistry_));
    }

    /// @notice Set the setup action.
    /// @param setupAction_ The setup action address.
    function setSetupAction(ISetupAction setupAction_) public nonZeroAddress(address(setupAction_)) onlyOwner {
        setupAction = setupAction_;
        emit SetSetupAction(address(setupAction_));
    }

    /// @notice Permit denomination whitelist.
    /// @param denominations_ The denomination address array.
    /// @param dusts_ The denomination dust array.
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

    /// @notice Remove denominations from whitelist.
    /// @param denominations_ The denominations to be removed.
    function forbidDenominations(address[] calldata denominations_) external onlyOwner {
        for (uint256 i = 0; i < denominations_.length; i++) {
            delete denomination[denominations_[i]];
            emit ForbidDenomination(denominations_[i]);
        }
    }

    /// @notice Check if the denomination is valid.
    /// @param denomination_ The denomination address.
    /// @return True if valid otherwise false.
    function isValidDenomination(address denomination_) external view returns (bool) {
        return denomination[denomination_].isPermitted;
    }

    /// @notice Get the denomination dust.
    /// @param denomination_ The denomination address.
    /// @return The dust of denomination.
    function getDenominationDust(address denomination_) external view returns (uint256) {
        return denomination[denomination_].dust;
    }

    /// @notice Ban the fund proxy.
    /// @param fundProxy_ The fund proxy address.
    function banFundProxy(address fundProxy_) external onlyOwner {
        bannedFundProxy[fundProxy_] = true;
        emit FundProxyBanned(fundProxy_);
    }

    /// @notice Unban the fund proxy.
    /// @param fundProxy_ The fund proxy address.
    function unbanFundProxy(address fundProxy_) external onlyOwner {
        bannedFundProxy[fundProxy_] = false;
        emit FundProxyUnbanned(fundProxy_);
    }

    /// @notice Set mortgage tier.
    /// @param level_ The level of mortgage.
    /// @param amount_ The mortgage amount.
    function setMortgageTier(uint256 level_, uint256 amount_) external onlyOwner {
        mortgageTier[level_].isSet = true;
        mortgageTier[level_].amount = amount_;
        emit SetMortgageTier(level_, amount_);
    }

    /// @notice Unset mortgage tier.
    /// @param level_ The level of mortage.
    function unsetMortgageTier(uint256 level_) external onlyOwner {
        delete mortgageTier[level_];
        emit UnsetMortgageTier(level_);
    }

    /// @notice Set execution action.
    /// @param action_ The action address.
    function setExecAction(address action_) external nonZeroAddress(action_) onlyOwner {
        execAction = action_;
        emit SetExecAction(action_);
    }

    /// @notice Permit creator whitelist.
    /// @param creators_ The permit creator address array.
    function permitCreators(address[] calldata creators_) external onlyOwner {
        for (uint256 i = 0; i < creators_.length; i++) {
            _creatorACL._permit(creators_[i]);
            emit PermitCreator(creators_[i]);
        }
    }

    /// @notice Remove creators from the whitelist.
    /// @param creators_ The creators to be removed.
    function forbidCreators(address[] calldata creators_) external onlyOwner {
        for (uint256 i = 0; i < creators_.length; i++) {
            _creatorACL._forbid(creators_[i]);
            emit ForbidCreator(creators_[i]);
        }
    }

    /// @notice Check if the creator is valid.
    /// @param creator_ The creator address.
    /// @return True if valid otherwise false.
    function isValidCreator(address creator_) external view returns (bool) {
        return _creatorACL._canCall(creator_);
    }

    /// @notice Permit asset whitelist.
    /// @param level_ The permit level.
    /// @param assets_ The permit asset array of level.
    function permitAssets(uint256 level_, address[] calldata assets_) external onlyOwner {
        for (uint256 i = 0; i < assets_.length; i++) {
            _assetACL._permit(level_, assets_[i]);
            emit PermitAsset(level_, assets_[i]);
        }
    }

    /// @notice Remove the assets from whitelist.
    /// @param level_ The level to be configured.
    /// @param assets_ The assets to be removed from the given level.
    function forbidAssets(uint256 level_, address[] calldata assets_) external onlyOwner {
        for (uint256 i = 0; i < assets_.length; i++) {
            _assetACL._forbid(level_, assets_[i]);
            emit ForbidAsset(level_, assets_[i]);
        }
    }

    /// @notice Check if the dealing assets are valid.
    /// @param level_ The level to be checked.
    /// @param assets_ The assets to be checked in the given level.
    /// @return True if valid otherwise false.
    function isValidDealingAssets(uint256 level_, address[] calldata assets_) external view returns (bool) {
        for (uint256 i = 0; i < assets_.length; i++) {
            if (!isValidDealingAsset(level_, assets_[i])) {
                return false;
            }
        }
        return true;
    }

    /// @notice Check if the dealing asset is valid.
    /// @param level_ The level to be checked.
    /// @param asset_ The asset to be checked in the given level.
    /// @return True if valid otherwise false.
    function isValidDealingAsset(uint256 level_, address asset_) public view returns (bool) {
        return _assetACL._canCall(level_, asset_);
    }

    /// @notice Check if the initial assets are valid.
    /// @param level_ The level to be checked.
    /// @param assets_ The assets to be checked in the given level.
    /// @return True if valid otherwise false.
    function isValidInitialAssets(uint256 level_, address[] calldata assets_) external view returns (bool) {
        for (uint256 i = 0; i < assets_.length; i++) {
            if (!isValidInitialAsset(level_, assets_[i])) {
                return false;
            }
        }
        return true;
    }

    /// @notice Check if the initial asset is valid.
    /// @param level_ The level to be checked.
    /// @param asset_ The asset to be checked in the given level.
    /// @return True if valid otherwise false.
    function isValidInitialAsset(uint256 level_, address asset_) public view returns (bool) {
        // check if input check flag is true
        if (fInitialAssetCheck) {
            return _assetACL._canCall(level_, asset_);
        }
        return true;
    }

    /// @notice Permit delegate call function.
    /// @param level_ The permit level.
    /// @param tos_ The permit delegate call address array.
    /// @param sigs_ The permit function signature array.
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

    /// @notice Remove functions from the delegate call whitelist.
    /// @param level_ The level to be configured.
    /// @param tos_ The delegate call addresses to be removed.
    /// @param sigs_ The function signatures to be removed.
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

    /// @notice Check if the function can be delegate called.
    /// @param level_ The level to be checked.
    /// @param to_ The delegate call address to be checked.
    /// @param sig_ The function signature to be checked.
    /// @return True if can call otherwise false.
    function canDelegateCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _delegateCallACL._canCall(level_, to_, sig_);
    }

    /// @notice Permit contract call functions.
    /// @param level_ The level to be configured.
    /// @param tos_ The contract call addresses to be permitted.
    /// @param sigs_ The function signatures to be permitted.
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

    /// @notice Remove the function from contract call whitelist.
    /// @param level_ The level to be configured.
    /// @param tos_ The contract call addresses to be removed.
    /// @param sigs_ The function signatures to be removed.
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

    /// @notice Check if the function can be called.
    /// @param level_ The level to be configured.
    /// @param to_ The contract call address to be removed.
    /// @param sig_ The function signature to be removed.
    /// @return True if can call otherwise false.
    function canContractCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _contractCallACL._canCall(level_, to_, sig_);
    }

    /// @notice Permit the handler functions.
    /// @param level_ The level to be configured.
    /// @param tos_ The handler addresses to be permitted.
    /// @param sigs_ The function signatures to be permitted.
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

    /// @notice Remove handler functions from whitelist.
    /// @param level_ The level to be configured.
    /// @param tos_ The handler addresses to be removed.
    /// @param sigs_ The function signatures to be removed.
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

    /// @notice Check if the handler function can be called.
    /// @param level_ The level to be checked.
    /// @param to_ The handler address to be checked in the given level.
    /// @param sig_ The function signature to be checked in the given level.
    /// @return True if can call otherwise false.
    function canHandlerCall(
        uint256 level_,
        address to_,
        bytes4 sig_
    ) external view returns (bool) {
        return _handlerCallACL._canCall(level_, to_, sig_);
    }
}
