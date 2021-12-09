// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAssetRegistry.sol";

/// @notice The registry database for asset router
contract AssetRegistry is IAssetRegistry, Ownable {
    // bytes32 public constant DEPRECATED = bytes10(0x64657072656361746564);

    bool public override fHalt;
    mapping(address => bool) public bannedResolvers;
    mapping(address => address) private _resolvers;

    event Registered(address indexed asset, address resolver);
    event Unregistered(address indexed asset);
    event BannedResolver(address indexed resolver);
    event unbannedResolver(address indexed resolver);
    event Halted();
    event Unhalted();

    modifier isNotHalted() {
        require(fHalt == false, "Halted");
        _;
    }

    modifier isHalted() {
        require(fHalt, "Not halted");
        _;
    }

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
        // require(asset != address(0), "asset zero address");
        require(resolver != address(0), "resolver zero address");
        require(_resolvers[asset] == address(0), "resolver is registered");

        // TODO: check banned resolver
        // require(!bannedResolvers[resolver], "resolver has been banned");
        _resolvers[asset] = resolver;
        emit Registered(asset, resolver);
    }

    /**
     * @notice Unregister a asset.
     * @param asset The asset to be unregistered.
     */
    function unregister(address asset) external override onlyOwner {
        // require(asset != address(0), "zero address");
        require(_resolvers[asset] != address(0), "not registered");
        _resolvers[asset] = address(0);
        emit Unregistered(asset);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function banResolver(address resolver) external override onlyOwner {
        require(resolver != address(0), "zero address");
        require(!bannedResolvers[resolver], "resolver is banned");
        bannedResolvers[resolver] = true;
        emit BannedResolver(resolver);
    }

    /**
     * @notice Ban specific resolver.
     * @param resolver The resolver to be banned.
     */
    function unbanResolver(address resolver) external override onlyOwner {
        require(resolver != address(0), "zero address");
        require(bannedResolvers[resolver], "resolver is not banned");
        bannedResolvers[resolver] = false;
        emit unbannedResolver(resolver);
    }

    /**
     * @notice Return the resolver of asset.
     * @param asset The asset want to be calculate value.
     */
    function resolvers(address asset)
        external
        view
        override
        isNotHalted
        returns (address)
    {
        address resolver = _resolvers[asset];
        require(resolver != address(0), "unregistered");
        require(!bannedResolvers[resolver], "resolver is banned");
        return resolver;
    }

    function halt() external isNotHalted onlyOwner {
        fHalt = true;
        emit Halted();
    }

    function unhalt() external isHalted onlyOwner {
        fHalt = false;
        emit Unhalted();
    }
}
