// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IAssetRegistry {
    function bannedResolvers(address) external view returns (bool);

    function fHalt() external view returns (bool);

    function halt() external;

    function unhalt() external;

    function register(address asset, address resolver) external;

    function unregister(address asset) external;

    function banResolver(address resolver) external;

    function unbanResolver(address resolver) external;

    function resolvers(address asset) external view returns (address);
}
