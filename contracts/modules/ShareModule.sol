// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetModule} from "./AssetModule.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract ShareModule is ModuleBase, AssetModule {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public pendingShares;
    address[] public pendingAccountList;
    mapping(address => uint256) public pendingWithdrawals;
    uint256 public totalPendingShare;

    function deposit(uint256 balance)
        external
        whenStates(State.Executing, State.WithdrawalPending)
        returns (uint256 share)
    {
        return _deposit(msg.sender, balance);
    }

    function withdraw(uint256 share)
        external
        whenNotState(State.Liquidating)
        returns (uint256 balance)
    {
        if (state == State.Executing) {
            return _withdraw(msg.sender, share);
        } else {
            return _withdrawPending(msg.sender, share);
        }
    }

    function calculateShare(uint256 balance)
        public
        view
        returns (uint256 share)
    {
        uint256 assetValue = getAssetValue();
        uint256 shareAmount = shareToken.totalSupply();
        share = (shareAmount * balance) / assetValue;
    }

    function calculateBalance(uint256 share)
        public
        view
        returns (uint256 balance)
    {
        uint256 assetValue = getAssetValue();
        uint256 shareAmount = shareToken.totalSupply();
        balance = (share * assetValue) / shareAmount;
    }

    function settlePendingWithdrawal() external returns (bool) {
        // Might lead to gas insufficient if pending list to long
        uint256 totalWithdrawal = _withdraw(address(this), totalPendingShare);
        while (pendingAccountList.length > 0) {
            address user = pendingAccountList[pendingAccountList.length - 1];
            uint256 share = pendingShares[user];
            uint256 withdrawal = (totalWithdrawal * share) / totalPendingShare;
            pendingWithdrawals[user] += withdrawal;
            pendingAccountList.pop();
        }

        totalPendingShare = 0;
        _enterState(State.Executing);

        return true;
    }

    function claimPendingWithdrawal() external returns (uint256 balance) {
        balance = pendingWithdrawals[msg.sender];
        denomination.safeTransfer(msg.sender, balance);
    }

    function _deposit(address user, uint256 balance)
        internal
        returns (uint256 share)
    {
        share = _addShare(user, balance);
        denomination.safeTransferFrom(msg.sender, address(vault), balance);
    }

    function _withdraw(address user, uint256 share) internal returns (uint256) {
        (uint256 shareLeft, uint256 balance) = _removeShare(user, share);
        denomination.safeTransferFrom(address(vault), user, balance);
        if (shareLeft != 0) {
            _enterState(State.WithdrawalPending);
            _withdrawPending(user, shareLeft);
        }

        return balance;
    }

    function _withdrawPending(address user, uint256 share)
        internal
        returns (uint256)
    {
        if (pendingShares[user] == 0) pendingAccountList.push(user);
        pendingShares[user] += share;
        totalPendingShare += share;
        shareToken.move(user, address(this), share);

        return 0;
    }

    function _addShare(address user, uint256 balance)
        internal
        returns (uint256 share)
    {
        share = calculateShare(balance);
        shareToken.mint(user, share);
    }

    function _removeShare(address user, uint256 share)
        internal
        returns (uint256 shareLeft, uint256 balance)
    {
        balance = calculateBalance(share);
        uint256 reserve = getReserve();
        if (balance > reserve) {
            uint256 shareToBurn = calculateShare(reserve);
            shareLeft = share - shareToBurn;
            balance = reserve;
            shareToken.burn(user, shareToBurn);
        } else {
            shareLeft = 0;
            shareToken.burn(user, share);
        }
    }
}
