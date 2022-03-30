// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

interface IFurucombo {
    function batchExec(
        address[] calldata tos_,
        bytes32[] calldata configs_,
        bytes[] memory datas_
    ) external payable returns (address[] memory);
}
