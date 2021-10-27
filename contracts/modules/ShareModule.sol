// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetModule} from "./AssetModule.sol";
import {ModuleBase} from "./ModuleBase.sol";

abstract contract ShareModule is ModuleBase, AssetModule, ERC20Permit {
    using SafeERC20 for IERC20;

    function deposit(uint256 balance)
        external
        whenStates(State.Executing, State.WithdrawalPending)
        returns (bool)
    {
        return _deposit(msg.sender, balance);
    }

    function withdraw(uint256 share)
        external
        whenStates(State.Executing, State.WithdrawalPending)
        returns (bool)
    {
        return _withdraw(msg.sender, share);
    }

    function calculateShare(uint256 balance)
        public
        view
        returns (uint256 share)
    {
        uint256 assetValue = getAssetValue();
        uint256 shareAmount = totalSupply();
        share = (shareAmount * balance) / assetValue;
    }

    function calculateBalance(uint256 share)
        public
        view
        returns (uint256 balance)
    {
        uint256 assetValue = getAssetValue();
        uint256 shareAmount = totalSupply();
        balance = (share * assetValue) / shareAmount;
    }

    function _deposit(address user, uint256 balance) internal returns (bool) {
        _addShare(user, balance);
        denomination.safeTransferFrom(msg.sender, vault, balance);

        return true;
    }

    function _withdraw(address user, uint256 share) internal returns (bool) {
        uint256 balance = _removeShare(user, share);
        denomination.safeTransferFrom(vault, user, balance);

        return true;
    }

    function _addShare(address user, uint256 balance)
        internal
        returns (uint256 share)
    {
        share = calculateShare(balance);
        _mint(user, share);
    }

    function _removeShare(address user, uint256 share)
        internal
        returns (uint256 balance)
    {
        balance = calculateBalance(share);
        _burn(user, share);
    }
}
