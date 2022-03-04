// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library Whitelist {
    uint256 internal constant ANY32 = type(uint256).max;
    address internal constant ANY20 =
        0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;
    bytes4 internal constant ANY4 = bytes4(type(uint32).max);

    // Action Whitelist
    struct ActionWList {
        mapping(uint256 => mapping(address => mapping(bytes4 => bool))) acl;
    }

    function canCall(
        ActionWList storage wl,
        uint256 level,
        address to,
        bytes4 sig
    ) internal view returns (bool) {
        return
            wl.acl[level][to][sig] ||
            wl.acl[level][to][ANY4] ||
            wl.acl[ANY32][to][sig];
    }

    function permit(
        ActionWList storage wl,
        uint256 level,
        address to,
        bytes4 sig
    ) internal {
        wl.acl[level][to][sig] = true;
    }

    function forbid(
        ActionWList storage wl,
        uint256 level,
        address to,
        bytes4 sig
    ) internal {
        wl.acl[level][to][sig] = false;
    }

    // Asset white list
    struct AssetWList {
        mapping(uint256 => mapping(address => bool)) acl;
    }

    function permit(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal {
        wl.acl[level][asset] = true;
    }

    function forbid(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal {
        wl.acl[level][asset] = false;
    }

    function canCall(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal view returns (bool) {
        return wl.acl[level][asset] || wl.acl[ANY32][asset];
    }

    // Creator white list
    struct CreatorWList {
        mapping(address => bool) acl;
    }

    function permit(CreatorWList storage wl, address creator) internal {
        wl.acl[creator] = true;
    }

    function forbid(CreatorWList storage wl, address creator) internal {
        wl.acl[creator] = false;
    }

    function canCall(CreatorWList storage wl, address creator)
        internal
        view
        returns (bool)
    {
        return wl.acl[creator] || wl.acl[ANY20];
    }
}
