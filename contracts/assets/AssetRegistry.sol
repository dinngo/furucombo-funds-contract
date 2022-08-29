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

    /// @notice Return the resolver of an asset.
    /// @param asset_ The target asset.
    /// @return The address of resolver.
    function resolvers(address asset_) external view returns (address) {
        address resolver = _resolvers[asset_];
        Errors._require(resolver != address(0), Errors.Code.ASSET_REGISTRY_UNREGISTERED);
        Errors._require(!bannedResolvers[resolver], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        return resolver;
    }

    /// @notice Register assets with resolver.
    /// @param assets_ The asset addresses.
    /// @param resolvers_ The resolver addresses.
    function registerMulti(address[] calldata assets_, address[] calldata resolvers_) external onlyOwner {
        Errors._require(
            assets_.length == resolvers_.length,
            Errors.Code.ASSET_REGISTRY_ASSETS_AND_RESOLVERS_LENGTH_INCONSISTENT
        );
        for (uint256 i = 0; i < assets_.length; i++) {
            _register(assets_[i], resolvers_[i]);
        }
    }

    /// @notice Register an asset with resolver.
    /// @param asset_ The asset address.
    /// @param resolver_ The resolver address.
    function register(address asset_, address resolver_) external onlyOwner {
        _register(asset_, resolver_);
    }

    /// @notice Unregister assets.
    /// @param assets_ The assets to be unregistered.
    function unregisterMulti(address[] calldata assets_) external onlyOwner {
        for (uint256 i = 0; i < assets_.length; i++) {
            _unregister(assets_[i]);
        }
    }

    /// @notice Unregister an asset.
    /// @param asset_ The asset to be unregistered.
    function unregister(address asset_) external onlyOwner {
        _unregister(asset_);
    }

    /// @notice Ban specific resolver.
    /// @param resolver_ The resolver to be banned.
    function banResolver(address resolver_) external onlyOwner {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(!bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        bannedResolvers[resolver_] = true;
        emit BannedResolver(resolver_);
    }

    /// @notice Unban specific resolver.
    /// @param resolver_ The resolver to be unbanned.
    function unbanResolver(address resolver_) external onlyOwner {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_NON_BANNED_RESOLVER);
        bannedResolvers[resolver_] = false;
        emit UnbannedResolver(resolver_);
    }

    function _register(address asset_, address resolver_) internal {
        Errors._require(resolver_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_RESOLVER_ADDRESS);
        Errors._require(asset_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS);
        Errors._require(!bannedResolvers[resolver_], Errors.Code.ASSET_REGISTRY_BANNED_RESOLVER);
        Errors._require(_resolvers[asset_] == address(0), Errors.Code.ASSET_REGISTRY_REGISTERED_RESOLVER);

        _resolvers[asset_] = resolver_;
        emit Registered(asset_, resolver_);
    }

    function _unregister(address asset_) internal {
        Errors._require(asset_ != address(0), Errors.Code.ASSET_REGISTRY_ZERO_ASSET_ADDRESS);
        Errors._require(_resolvers[asset_] != address(0), Errors.Code.ASSET_REGISTRY_NON_REGISTERED_RESOLVER);

        _resolvers[asset_] = address(0);
        emit Unregistered(asset_);
    }
}
