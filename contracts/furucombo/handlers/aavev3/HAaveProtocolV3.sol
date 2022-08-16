// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {HandlerBase} from "../HandlerBase.sol";
import {IFlashLoanReceiver} from "./IFlashLoanReceiver.sol";
import {IFurucomboProxy} from "../../interfaces/IFurucomboProxy.sol";
import {IPool, IPoolAddressesProvider, DataTypes} from "./IPool.sol";

contract HAaveProtocolV3 is HandlerBase, IFlashLoanReceiver {
    // prettier-ignore
    address public constant PROVIDER = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    uint16 public constant REFERRAL_CODE = 56;

    function getContractName() public pure override returns (string memory) {
        return "HAaveProtocolV3";
    }

    function supply(address asset, uint256 amount) external payable {
        _notMaticToken(asset);
        amount = _getBalance(asset, amount);
        _supply(asset, amount);
    }

    function withdraw(address asset, uint256 amount) external payable returns (uint256 withdrawAmount) {
        _notMaticToken(asset);
        withdrawAmount = _withdraw(asset, amount);
        _updateToken(asset);
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256 rateMode
    ) external payable {
        _notMaticToken(asset);
        address onBehalfOf = _getSender();
        _borrow(asset, amount, rateMode, onBehalfOf);
        _updateToken(asset);
    }

    function repay(
        address asset,
        uint256 amount,
        uint256 rateMode
    ) external payable returns (uint256 remainDebt) {
        _notMaticToken(asset);
        address onBehalfOf = _getSender();
        remainDebt = _repay(asset, amount, rateMode, onBehalfOf);
    }

    function flashLoan(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes,
        bytes calldata params
    ) external payable {
        _notMaticToken(assets);
        _requireMsg(assets.length == amounts.length, "flashLoan", "assets and amounts do not match");

        _requireMsg(assets.length == modes.length, "flashLoan", "assets and modes do not match");

        address onBehalfOf = _getSender();
        address pool = IPoolAddressesProvider(PROVIDER).getPool();

        try
            IPool(pool).flashLoan(address(this), assets, amounts, modes, onBehalfOf, params, REFERRAL_CODE)
        {} catch Error(string memory reason) {
            _revertMsg("flashLoan", reason);
        } catch {
            _revertMsg("flashLoan");
        }

        // approve pool zero
        for (uint256 i = 0; i < assets.length; i++) {
            _tokenApproveZero(assets[i], pool);
            if (modes[i] != 0) _updateToken(assets[i]);
        }
    }

    function executeOperation(
        address[] memory assets,
        uint256[] memory amounts,
        uint256[] memory premiums,
        address initiator,
        bytes memory params
    ) external override returns (bool) {
        _notMaticToken(assets);
        _requireMsg(msg.sender == IPoolAddressesProvider(PROVIDER).getPool(), "executeOperation", "invalid caller");

        _requireMsg(initiator == address(this), "executeOperation", "not initiated by the proxy");

        (address[] memory tos, bytes32[] memory configs, bytes[] memory datas) = abi.decode(
            params,
            (address[], bytes32[], bytes[])
        );
        IFurucomboProxy(address(this)).execs(tos, configs, datas);

        address pool = IPoolAddressesProvider(PROVIDER).getPool();
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountOwing = amounts[i] + premiums[i];
            _tokenApprove(assets[i], pool, amountOwing);
        }
        return true;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _supply(address asset, uint256 amount) internal {
        (address pool, address aToken) = _getPoolAndAToken(asset);
        _tokenApprove(asset, pool, amount);
        try IPool(pool).supply(asset, amount, address(this), REFERRAL_CODE) {} catch Error(string memory reason) {
            _revertMsg("supply", reason);
        } catch {
            _revertMsg("supply");
        }
        _tokenApproveZero(asset, pool);
        _updateToken(aToken);
    }

    function _withdraw(address asset, uint256 amount) internal returns (uint256 withdrawAmount) {
        (address pool, address aToken) = _getPoolAndAToken(asset);
        amount = _getBalance(aToken, amount);

        try IPool(pool).withdraw(asset, amount, address(this)) returns (uint256 ret) {
            withdrawAmount = ret;
        } catch Error(string memory reason) {
            _revertMsg("withdraw", reason);
        } catch {
            _revertMsg("withdraw");
        }
    }

    function _borrow(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) internal {
        IPool pool = IPool(IPoolAddressesProvider(PROVIDER).getPool());

        try pool.borrow(asset, amount, rateMode, REFERRAL_CODE, onBehalfOf) {} catch Error(string memory reason) {
            _revertMsg("borrow", reason);
        } catch {
            _revertMsg("borrow");
        }

        // Return debt asset to pool proxy
        DataTypes.ReserveData memory data = pool.getReserveData(asset);
        if (DataTypes.InterestRateMode(rateMode) == DataTypes.InterestRateMode.VARIABLE) {
            _updateToken(data.variableDebtTokenAddress);
        } else if (DataTypes.InterestRateMode(rateMode) == DataTypes.InterestRateMode.STABLE) {
            _updateToken(data.stableDebtTokenAddress);
        } else {
            _revertMsg("rateMode is not support");
        }
    }

    function _repay(
        address asset,
        uint256 amount,
        uint256 rateMode,
        address onBehalfOf
    ) internal returns (uint256 remainDebt) {
        address pool = IPoolAddressesProvider(PROVIDER).getPool();
        _tokenApprove(asset, pool, amount);

        try IPool(pool).repay(asset, amount, rateMode, onBehalfOf) {} catch Error(string memory reason) {
            _revertMsg("repay", reason);
        } catch {
            _revertMsg("repay");
        }

        _tokenApproveZero(asset, pool);

        DataTypes.ReserveData memory reserve = IPool(pool).getReserveData(asset);
        remainDebt = DataTypes.InterestRateMode(rateMode) == DataTypes.InterestRateMode.STABLE
            ? IERC20(reserve.stableDebtTokenAddress).balanceOf(onBehalfOf)
            : IERC20(reserve.variableDebtTokenAddress).balanceOf(onBehalfOf);
    }

    function _getPoolAndAToken(address underlying) internal view returns (address pool, address aToken) {
        pool = IPoolAddressesProvider(PROVIDER).getPool();
        try IPool(pool).getReserveData(underlying) returns (DataTypes.ReserveData memory data) {
            aToken = data.aTokenAddress;
            _requireMsg(aToken != address(0), "General", "aToken should not be zero address");
        } catch Error(string memory reason) {
            _revertMsg("General", reason);
        } catch {
            _revertMsg("General");
        }
    }
}
