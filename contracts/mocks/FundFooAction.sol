// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ActionBase} from "../actions/ActionBase.sol";
import {FundFoo} from "./FundFoo.sol";

contract FundFooAction is ActionBase {
    event FooBytes32(bytes32 a);
    event FooUint256(uint256 b);

    function getContractName() public pure returns (string memory) {
        return "FooAction";
    }

    function bar(address to_) external payable returns (bytes32 ret) {
        ret = FundFoo(to_).bar();
    }

    function barUint(address to_) external payable returns (uint256 ret) {
        ret = FundFoo(to_).barUint();
    }

    function bar1(address to_, bytes32 a_) external payable returns (bytes32 ret) {
        ret = FundFoo(to_).bar1(a_);
    }

    function bar2(
        address to_,
        bytes32 a_,
        bytes32 b_
    ) external payable returns (bytes32 ret) {
        ret = FundFoo(to_).bar2(a_, b_);
    }

    function barUint1(address to_, uint256 a_) external payable returns (uint256 ret) {
        ret = FundFoo(to_).barUint1(a_);
    }

    function barUint2(
        address to_,
        uint256 a_,
        uint256 value_
    ) external payable returns (uint256 ret) {
        ret = FundFoo(to_).barUint2{value: value_}(a_);
    }

    function barUList(
        address to_,
        uint256 a_,
        uint256 b_,
        uint256 c_
    ) external payable returns (uint256[] memory ret) {
        ret = FundFoo(to_).barUList(a_, b_, c_);
    }

    function barUList2(address to_, uint256[] calldata uList_) external payable returns (uint256[] memory ret) {
        ret = FundFoo(to_).barUList2(uList_);
    }

    function revertCall() external payable {
        revert("revertCall");
    }

    function addAssets(address[] calldata assets_) external payable {
        for (uint256 i = 0; i < assets_.length; i++) {
            _addDealingAsset(assets_[i]);
        }
    }

    function decreaseQuota(address[] calldata assets_, uint256[] calldata amounts_) external payable {
        for (uint256 i = 0; i < assets_.length; i++) {
            _decreaseAssetQuota(assets_[i], amounts_[i]);
        }
    }

    function increaseQuota(address[] calldata assets_, uint256[] calldata amounts_) external payable {
        for (uint256 i = 0; i < assets_.length; i++) {
            _increaseAssetQuota(assets_[i], amounts_[i]);
        }
    }
}
