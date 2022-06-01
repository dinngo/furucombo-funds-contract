# Furucombo Funds

This repository contains the smart contract source code for the Furucombo Fund protocol. This repository uses Hardhat as a development environment for compilation, testing, and deployment tasks.

## What is Furucombo Funds?

Furucombo Funds is a platform that enables users to create their own funds, and also join other users’ funds to maximize their value of knowledge and assets.

The [fund manager](#fund-manager) is able to execute different strategies on behalf of the fund to get the best profit and earn a portion of the resulting performance. [Investors](#investor) can join the funds they are interested in by simply buying fund shares, making strategic investments for professionals.

The strategy execution is empowered by integrated DeFi protocols and Furucombo system, the leading DeFi aggregator, to enable all kinds of leveraging strategies.

## Bug bounty

This repository is subject to the [Immunefi bug bounty](TBD) program, per the terms defined [here](TBD).

## Audits

You can find all audit reports under the audit folder

- [Dedaub](./audit/Dedaub/Furucombo_Funds_Audit_Final_Report.pdf)
- [PeckShield](./audit//PeckShield/PeckShield-Audit-Report-Furucombo-Funds-v1.0.pdf)

## Installation

```console
$ yarn install
```

## Test

```console
$ export RPC_NODE=https://polygon-mainnet.g.alchemy.com/v2/{Your_project_ID}
$ scripts/test.sh
```

## License

Furucombo is released under the [MIT License](LICENSE).

---

# System structure

![image](./image/System%20structure.png)

## Comptroller

The configuration center of Furucombo funds system. The comptroller is implemented through an [upgradable proxy](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/contracts/proxy/transparent) structure.

## Mortgage Vault

The vault to keep the creator’s mortgage. Before creators [create funds](#fund-manager), they need to prepare the corresponding amount of assets to their desired tier. The assets will be transferred to the [mortgage vault](#mortgage-vault) when the fund is [created](#create-fund).

## Fund Proxy Factory

Creators [create funds](#create-fund) through [Fund Proxy Factory](#fund-proxy-factory). When the fund is created, [Fund Proxy](#fund-proxy), [Share Token](#share-token) is created, and the mortgage asset is transferred to the [Mortgage Vault](#mortgage-vault). Certain attributes of the fund are assigned and set at the same time.

## Fund Proxy

The logic unit of Furucombo funds. The fund is implemented through a [beacon proxy](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/contracts/proxy/beacon) structure.The implementation target is set at the beacon defined in the [comptroller](#comptroller). For more details, see the explanation [below](#fund-implementation).

## Asset Router

The value calculation unit, which calculates the asset value for the fund by assigning asset, amount, and quote. The system is composed of Oracle, Resolver, and Registry. Oracle is responsible for getting asset prices through interacting with external Oracle protocol (only ChainLink currently). Resolver parses assets and resolves into a specific set (for example, Aave token). Resolvers need to be registered to the Registry to be valid resolvers and used in the Asset Router.

## Furucombo Proxy

The strategy executor unit. May refer to Furucombo. Slightly customized for the asset management in the Furucombo fund system.

# Fund Implementation

FundImplementation is composed of different modules: `ShareModule`, `AssetModule`, `ExecutionModule`, `ManagementFeeModule` and `PerformanceFeeModule`. The strategy executed by the fund manager will be passed to the vault for action as shown below.

![image](./image/Fund%20Proxy%20Implementation.png)

## Share Token

Each fund has its own share token. The address(1) is reserved as the outstanding account for the calculation of [performance fee](#performance-fee).

## Vault

The execution unit of Furucombo funds. The vault is implemented through the DSProxy structure. All the fund assets are kept in the vault for the execution.

## TaskExecutor

An action that enables DSProxy to handle the strategy execution, including calls, delegate-calls to different targets, and also to do certain verifications.

# State machine

Fund itself has several states to represent the lifecycle, which are [Initializing](#initializing), [Reviewing](#reviewing), [Executing](#executing), [Pending](#pending), [Liquidating](#liquidating) and [Closed](#closed) as the below graph. Every action to the fund should be a call to the [FundProxy](#fund-proxy), which will trigger the logic defined in [FundImplementation](#fund-implementation).

![image](./image/State%20machine.png)

## Initializing

The initial state of a newly created fund, set the basic parameters of Fund.

## Reviewing

After initialization, only the fee parameter can be adjusted.

## Executing

Normal operation, when the remaining amount of denomination is positive.

## Pending

Unable to fulfill [redemption](#redeem-share) will enter pending state. When the purchase amount is sufficient or the strategy is executed to settle the debt, it will resume to Executing state.

## Liquidating

When the fund stays in pending state over pendingExpiration, it enters liquidation process. The fund will be transferred to the [liquidator](#liquidator), who is responsible for exchanging assets back to denomination tokens.

## Closed

When only denomination tokens are left, the fund can be closed and the [investors](#investor) can redeem their share token.

# Roles and behaviors

There are different roles in the system that use different behaviors. The roles are divided into [Comptroller Manager](#comptroller-manager), [Fund Manager](#fund-manager), [Investor](#investor), [Liquidator](#liquidator) and [Others](#others).

## Comptroller Manager

### Halting

```solidity
// Halt the entire fund system.
function halt() external {}

// Unhalt the entire fund system.
function unHalt() external
```

### Configuration setting

```solidity
// Set the fee collector for collecting the execution fee.
function setFeeCollector(address collector_) public

// Set the execution fee percentage.
function setExecFeePercentage(uint256 percentage_) public

// Set the liquidator for the fund that enters the liquidating state.
function setPendingLiquidator(address liquidator_) public

// Set the waiting time of the fund to be in the pending state. Fund can be liquidated after the time is expired.
function setPendingExpiration(uint256 expiration_) public

// Set the penalty of redeeming shares in pending state. Also being the bonus of purchasing shares in pending state.
function setPendingPenalty(uint256 penalty_) public

// Set the limit rate that asset value can drop after an execution.
function setExecAssetValueToleranceRate(uint256 tolerance_) public

// Set if the initial fund asset should be verified or not.
function setInitialAssetCheck(bool check_) public

// Set the setup action.
function setSetupAction(ISetupAction setupAction_) public

// Set the execution action for fund execution. Currently being the TaskExecutor.
function setExecAction(address action_) external

// Set the DSProxy registry.
function setDSProxyRegistry(IDSProxyRegistry dsProxyRegistry_) public
```

### Mortgage management

```solidity
// Set the mortgage vault.
function setMortgageVault(IMortgageVault mortgageVault_) public

// Set the mortgage amount for a given tier.
function setMortgageTier(uint256 level_, uint256 amount_) external

// Unset the tier.
function unsetMortgageTier(uint256 level_) external
```

### Denomination asset management

```solidity
// Permit assets to be assigned as a denomination asset for a fund.
function permitDenominations(address[] calldata denominations_, uint256[] calldata dusts_) external

// Forbid assets to be assigned as a denomination asset for a fund. Does not affect an existing fund.
function forbidDenominations(address[] calldata denominations_) external
```

### Fund management

```solidity
// Ban a fund.
function banFundProxy(address fundProxy_) external

// Unban a fund.
function unbanFundProxy(address fundProxy_) external
```

### Creator management

```solidity
// Permit accounts to be able to create a fund.
function permitCreators(address[] calldata creators_) external

// Forbid accounts from being able to create a fund.
function forbidCreators(address[] calldata creators_) external
```

### Asset management

```solidity
// Set maximum capacity of assets.
function setAssetCapacity(uint256 assetCapacity_) public

// Set the asset router address.
function setAssetRouter(IAssetRouter assetRouter_) public

// Permit assets to be used in a fund.
function permitAssets(uint256 level_, address[] calldata assets_) external

// Forbid assets from being used in a fund.
function forbidAssets(uint256 level_, address[] calldata assets_) external
```

### Execution management

```solidity
// Permit functions in a contract to be delegate-called in execution.
function permitDelegateCalls(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external

// Forbid functions in a contract from being delegate-called in execution.
function forbidDelegateCalls(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external

// Permit functions in a contract to be called in execution.
function permitContractCalls(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external

// Forbid functions in a contract from being called in execution.
function forbidContractCalls(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external

// Permit functions in a contract to be used at Furucombo in execution.
function permitHandlers(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external

// Forbid functions in a contract from being used at Furucombo in execution.
function forbidHandlers(
    uint256 level_,
    address[] calldata tos_,
    bytes4[] calldata sigs_
) external
```

## Fund Manager

### Create fund

```solidity
// Create a fund. The creator should be whitelisted in Comptroller.
function createFund(
    IERC20Metadata denomination_,
    uint256 level_,
    uint256 mFeeRate_,
    uint256 pFeeRate_,
    uint256 crystallizationPeriod_,
    string memory shareTokenName_
) external
```

### Configuration setting

```solidity
// Set the management fee rate. Can only be called before the fund is finalized.
function setManagementFeeRate(uint256 mFeeRate_) external

// Set the performance fee rate. Can only be called before the fund is finalized.
function setPerformanceFeeRate(uint256 pFeeRate_) external

// Set the period of crystallization. Can only be called before the fund is finalized.
function setCrystallizationPeriod(uint256 crystallizationPeriod_) external
```

### State management

```solidity
// Finalize the fund and start the execution of the fund.
function finalize() external

// Close the fund. Can be called after there is only the denomination asset remaining in the fund. Can only redeem shares afterwards.
function close() public

// Add the tracking asset of the fund. Can only be called when the asset value is greater than the predetermined dust value or negative (representing debt).
function addAsset(address asset_) external

Remove the tracking asset of the fund. Can only be called when the asset value is positive and less than the predetermined dust value.
function removeAsset(address asset_) external
```

### Execute

```solidity
// Execute the strategy by using the assets in the vault.
function execute(bytes calldata data_) public
```

### Fee

```solidity
// Crystallize and claim the performance fee in shares. Can only be called once in every crystallization period, which is defined by the starting time when the fund is finalized and the time interval set by setCrystallizationPeriod.
function crystallize() public returns (uint256)

// Claim the management fee manually.
function claimManagementFee() external returns (uint256)
```

## Investor

### Purchase share

```solidity
// Purchase shares with the denomination asset. Will receive an extra bonus if the fund is under the pending state.
function purchase(uint256 balance_) external returns (uint256 share)
```

### Redeem share

```solidity
// Redeem shares and get denomination assets back. If the reserve is insufficient, or the fund is already in pending state, the share of redemption will be treated as pending share. Redeeming shares in pending state will be subject to a specific percentage of penalty, which is used as the bonus for the purchase of other investors.
function redeem(uint256 share_, bool acceptPending_) external returns (uint256 balance)

// Claim the denomination asset from settled pending shares.
function claimPendingRedemption(address user_) external returns (uint256 balance)
```

## Liquidator

There is no specific function for a liquidator. The liquidator is the fund manager under the liquidating state. After the fund is executed and only the denomination asset is remaining, the fund can be [closed](#closed).

## Others

```solidity
// Can be called by anyone when the reserve is sufficient to settle the pending share. The total pending shares will be redeemed at the same price. Resume the fund from pending state to execution state.
function resume() external

// Can be called by anyone when the fund is under the pending state for too long that expires the predetermined expiration time, the fund can be liquidated. The ownership of the fund will be transferred to the predetermined liquidator.
function liquidate() external
```

# Fee structure

## Preliminary

- All fees are counted through share.
- Management fee stands for the reward of managing the asset of the fund. Can be accumulated and claimed any time
- Performance fee stands for the reward of the value growth of the fund. Can be accumulated any time. Can only be claimed through crystallization

## Terminology

- **Outstanding share**
  - The shares of performance fee that are not crystallized at the moment will be counted as outstanding shares
- **Outstanding value**
  - Performance fee that is not crystallized at the moment will be counted as outstanding value
- **Gross total share**
  - The total share amount
- **Net total share**
  - The share amount without the outstanding shares
- **Gross asset value**
  - The total asset value
- **Net asset value**
  - The asset value without the outstanding value
- **Gross share price**
  - The share price without considering the outstanding share. Can be calculated by dividing the gross asset value by net total share.
- **Net share price**
  - The share price considering the outstanding value. Can be calculated by
    - dividing the net asset value by the net total share
    - dividing the gross asset value by the gross total share

## Management Fee

- Management fees are updated every time before purchase and redeem.
- Management fees are updated only when the fund is under Executing.
- Management fees can also be claimed manually.
- The management fee is updated with the effective fee rate and the time interval between current time and last claim time
- Effective fee rate is calculated by
  $$r_e=e^{\frac{\ln(1-r)}{t_m}}$$
  $r_e$: Effective fee rate

  $r$: Management fee rate

  $t_m$: Management fee time interval

- Management fee is counted by accumulating the gross total share and the time interval
  $$s_m=({r_e}^{(t-t_l)}-1)\cdot s_g$$
  $s_m$: Share for management fee

  $t$: Current time

  $t_l$: Time for last claim

  $s_g$: Gross total share

- Management fees are settled right after the accumulation. The time is recorded for the last claim time.

## Performance Fee

- Performance fees are updated when
  - Before total share amount changes, like purchase and redeem
  - Before crystallization
- Performance fees are updated by - Calculating the current share price - Calculating the price difference with the last time performance fee is updated, in order to get the accumulated wealth
  $$\Delta w=(max(p_{hwm},p)-max(p_{hwm},p_l))\cdot s_n$$
  $\Delta w$: Accumulated wealth since last time

  $p$: Current share price

  $p_{hwm}$: Share price of high water mark

  $p_l$: Share price of last update

  $s_n$: Net total share

  - The accumulated wealth might decrease if the share price drops
  - Only when the price is greater than the high water mark the fee will be accumulated
  - Update the outstanding fee with the accumulated wealth and performance fee rate

  $$\Delta v_{op}=\Delta w\cdot r_p$$
  $$v_{op}=max(0,v_{op}+\Delta v_{op})$$
  $$s_{op}=s_n\cdot \frac{v_{op}}{v_n}$$
  $$v_n=v_g-v_{op}$$
  $v_{op}$: Outstanding performance fee value

  $s_{op}$: Outstanding share for performance fee

  $r_p$: Performance fee rate

  $v_n$: Net asset value

  $v_g$: Gross asset value

- Crystallization can be triggered by the fund manager when
  - The first crystallization period passed
  - Fund manager can crystallize once every crystallization period
- Crystallization is processed by
  - Payout the outstanding share to the manager
  - Update the gross share price $p_l=\frac{v_g}{s_n}$
  - Update the high water mark if the gross share price is greater $p_{hwm}=max(p_{hwm},p_l)$
