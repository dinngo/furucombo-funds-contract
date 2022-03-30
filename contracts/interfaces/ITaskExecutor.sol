// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITaskExecutor {
    function batchExec(
        address[] calldata tokensIn_,
        uint256[] calldata amountsIn_,
        address[] calldata tos_,
        bytes32[] calldata configs_,
        bytes[] memory datas_
    ) external payable returns (address[] calldata);
}
