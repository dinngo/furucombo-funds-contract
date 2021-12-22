// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";

/// @notice The registry database for asset router
contract AssetRegistry is IAssetRegistry, Ownable {
    mapping(address => bool) public bannedResolvers;
    mapping(address => address) private _resolvers;

    event Registered(address indexed asset, address resolver);
    event Unregistered(address indexed asset);
    event BannedResolver(address indexed resolver);
    event unbannedResolver(address indexed resolver);
    event Halted();
    event Unhalted();

    /**
     * @notice Register a asset with resolver.
     * @param asset asset address.
     * @param resolver resolver address.
     */
    function register(address asset, address resolver)
        external
        override
        onlyOwner
    {
        require(resolver != address(0), "AssetRegistry: resolver zero address");
        require(asset != address(0), "AssetRegistry: asset zero address");
        require(
            !bannedResolvers[resolver],
            "AssetRegistry: resolver has been banned"
        );
        require(
            _resolvers[asset] == address(0),
            "AssetRegistry: resolver is registered"
        );

        _resolvers[asset] = resolver;
        emit Registered(asset, resolver);
    }

    /**
     * @notice Unregister a asset.
     * @param asset The asset to be unregistered.
     */
    function unregister(address asset) external override onlyOwner {
        require(asset != address(0), "AssetRegistry: asset zero address");
        require(
            _resolvers[asset] != address(0),
            "AssetRegistry: asset not registered"
        );
        _resolvers[asset] = address(0);
        emit Unregistered(asset);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function banResolver(address resolver) external override onlyOwner {
        require(resolver != address(0), "AssetRegistry: resolver zero address");
        require(
            !bannedResolvers[resolver],
            "AssetRegistry: resolver is banned"
        );
        bannedResolvers[resolver] = true;
        emit BannedResolver(resolver);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function unbanResolver(address resolver) external override onlyOwner {
        require(resolver != address(0), "AssetRegistry: resolver zero address");
        require(
            bannedResolvers[resolver],
            "AssetRegistry: resolver is not banned"
        );
        bannedResolvers[resolver] = false;
        emit unbannedResolver(resolver);
    }

    /**
     * @notice Return the resolver of asset.
     * @param asset The asset want to be calculate value.
     */
    function resolvers(address asset) external view override returns (address) {
        address resolver = _resolvers[asset];
        require(resolver != address(0), "AssetRegistry: unregistered");
        require(
            !bannedResolvers[resolver],
            "AssetRegistry: resolver is banned"
        );
        return resolver;
    }
}
