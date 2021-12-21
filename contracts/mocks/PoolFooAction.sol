// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {ActionBase} from "../actions/ActionBase.sol";
import {PoolFoo} from "./PoolFoo.sol";

contract PoolFooAction is ActionBase {
    event FooBytes32(bytes32 a);
    event FooUint256(uint256 b);

    function getContractName() public pure returns (string memory) {
        return "FooAction";
    }

    function bar(address to) external payable returns (bytes32 ret) {
        ret = PoolFoo(to).bar();
    }

    function barUint(address to) external payable returns (uint256 ret) {
        ret = PoolFoo(to).barUint();
    }

    function bar1(address to, bytes32 a)
        external
        payable
        returns (bytes32 ret)
    {
        ret = PoolFoo(to).bar1(a);
    }

    function bar2(
        address to,
        bytes32 a,
        bytes32 b
    ) external payable returns (bytes32 ret) {
        ret = PoolFoo(to).bar2(a, b);
    }

    function barUint1(address to, uint256 a)
        external
        payable
        returns (uint256 ret)
    {
        ret = PoolFoo(to).barUint1(a);
    }

    function barUint2(
        address to,
        uint256 a,
        uint256 value
    ) external payable returns (uint256 ret) {
        ret = PoolFoo(to).barUint2{value: value}(a);
    }

    function barUList(
        address to,
        uint256 a,
        uint256 b,
        uint256 c
    ) external payable returns (uint256[] memory ret) {
        ret = PoolFoo(to).barUList(a, b, c);
    }

    function barUList2(address to, uint256[] calldata uList)
        external
        payable
        returns (uint256[] memory ret)
    {
        ret = PoolFoo(to).barUList2(uList);
    }

    function revertCall() external payable {
        revert("revertCall");
    }

    function addAssets(address[] calldata assets) external payable {
        for (uint256 i = 0; i < assets.length; i++) {
            addDealingAsset(assets[i]);
        }
    }

    function decreaseQuota(
        address[] calldata assets,
        uint256[] calldata amounts
    ) external payable {
        for (uint256 i = 0; i < assets.length; i++) {
            decreaseFundQuota(assets[i], amounts[i]);
        }
    }

    function increaseQuota(
        address[] calldata assets,
        uint256[] calldata amounts
    ) external payable {
        for (uint256 i = 0; i < assets.length; i++) {
            increaseFundQuota(assets[i], amounts[i]);
        }
    }
}
