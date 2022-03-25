// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IRegistry {
    function handlers(address) external view returns (bytes32);

    function callers(address) external view returns (bytes32);

    function bannedAgents(address) external view returns (uint256);

    function fHalt() external view returns (bool);

    function isValidHandler(address handler) external view returns (bool);

    function isValidCaller(address handler) external view returns (bool);

    function handlerCalleeWhiteList(address handler, address callee)
        external
        view
        returns (bool);
}
