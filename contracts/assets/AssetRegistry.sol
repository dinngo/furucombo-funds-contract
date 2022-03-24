// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../utils/Errors.sol";
import {IAssetRegistry} from "./interfaces/IAssetRegistry.sol";

/// @notice The registry database for asset router
contract AssetRegistry is IAssetRegistry, Ownable {
    mapping(address => bool) public bannedResolvers;
    mapping(address => address) private _resolvers;

    event Registered(address indexed asset, address indexed resolver);
    event Unregistered(address indexed asset);
    event BannedResolver(address indexed resolver);
    event UnbannedResolver(address indexed resolver);
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
        Errors._require(
            resolver != address(0),
            Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS
        );
        Errors._require(
            asset != address(0),
            Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS
        );
        Errors._require(
            !bannedResolvers[resolver],
            Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER
        );
        Errors._require(
            _resolvers[asset] == address(0),
            Errors.Code.ASSET_REGISTRY_REGISTERED_RESOLVER
        );

        _resolvers[asset] = resolver;
        emit Registered(asset, resolver);
    }

    /**
     * @notice Unregister a asset.
     * @param asset The asset to be unregistered.
     */
    function unregister(address asset) external override onlyOwner {
        Errors._require(
            asset != address(0),
            Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS
        );
        Errors._require(
            _resolvers[asset] != address(0),
            Errors.Code.ASSET_REGISTRY_NON_REGISTERED_RESOLVER
        );
        _resolvers[asset] = address(0);
        emit Unregistered(asset);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function banResolver(address resolver) external override onlyOwner {
        Errors._require(
            resolver != address(0),
            Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS
        );
        Errors._require(
            !bannedResolvers[resolver],
            Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER
        );
        bannedResolvers[resolver] = true;
        emit BannedResolver(resolver);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function unbanResolver(address resolver) external override onlyOwner {
        Errors._require(
            resolver != address(0),
            Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS
        );
        Errors._require(
            bannedResolvers[resolver],
            Errors.Code.ASSET_REGISTRY_NON_BANNED_RESOLVER
        );
        bannedResolvers[resolver] = false;
        emit UnbannedResolver(resolver);
    }

    /**
     * @notice Return the resolver of asset.
     * @param asset The asset want to be calculate value.
     */
    function resolvers(address asset) external view override returns (address) {
        address resolver = _resolvers[asset];
        Errors._require(
            resolver != address(0),
            Errors.Code.ASSET_REGISTRY_UNREGISTERED
        );
        Errors._require(
            !bannedResolvers[resolver],
            Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER
        );
        return resolver;
    }
}
