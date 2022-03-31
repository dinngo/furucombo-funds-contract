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

    /**
     * @notice Return the resolver of asset.
     * @param asset_ The asset want to be calculate value.
     */
    function resolvers(address asset_) external view override returns (address) {
        address resolver = _resolvers[asset_];
        Errors._require(resolver != address(0), Errors.Code.ASSET_REGISTRY_UNREGISTERED);
        Errors._require(!bannedResolvers[resolver], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        return resolver;
    }

    /**
     * @notice Register a asset with resolver.
     * @param asset_ asset address.
     * @param resolver_ resolver address.
     */
    function register(address asset_, address resolver_) external override onlyOwner {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(asset_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS);
        Errors._require(!bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        Errors._require(_resolvers[asset_] == address(0), Errors.Code.ASSET_REGISTRY_REGISTERED_RESOLVER);

        _resolvers[asset_] = resolver_;
        emit Registered(asset_, resolver_);
    }

    /**
     * @notice Unregister a asset.
     * @param asset_ The asset to be unregistered.
     */
    function unregister(address asset_) external override onlyOwner {
        Errors._require(asset_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS);
        Errors._require(_resolvers[asset_] != address(0), Errors.Code.ASSET_REGISTRY_NON_REGISTERED_RESOLVER);
        _resolvers[asset_] = address(0);
        emit Unregistered(asset_);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver_ The resolver to be banned.
     */
    function banResolver(address resolver_) external override onlyOwner {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(!bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        bannedResolvers[resolver_] = true;
        emit BannedResolver(resolver_);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver_ The resolver to be banned.
     */
    function unbanResolver(address resolver_) external override onlyOwner {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_NON_BANNED_RESOLVER);
        bannedResolvers[resolver_] = false;
        emit UnbannedResolver(resolver_);
    }
}
