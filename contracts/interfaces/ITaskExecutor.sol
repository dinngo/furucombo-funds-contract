// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITaskExecutor {
    function batchExec(
        address[] calldata tokensIn,
        uint256[] calldata amountsIn,
        address[] calldata tos,
        bytes32[] calldata configs,
        bytes[] memory datas
    ) external payable returns (address[] calldata);
}
