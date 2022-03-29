// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library Whitelist {
    uint256 internal constant _ANY32 = type(uint256).max;
    address internal constant _ANY20 = 0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF;
    bytes4 internal constant _ANY4 = bytes4(type(uint32).max);

    // Action Whitelist
    struct ActionWList {
        mapping(uint256 => mapping(address => mapping(bytes4 => bool))) acl;
    }

    function _canCall(
        ActionWList storage wl,
        uint256 level,
        address to,
        bytes4 sig
    ) internal view returns (bool) {
        return wl.acl[level][to][sig] || wl.acl[level][to][_ANY4] || wl.acl[_ANY32][to][sig];
    }

    function _permit(
        ActionWList storage wl,
        uint256 level,
        address to,
        bytes4 sig
    ) internal {
        wl.acl[level][to][sig] = true;
    }

    function _forbid(
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

    function _permit(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal {
        wl.acl[level][asset] = true;
    }

    function _forbid(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal {
        wl.acl[level][asset] = false;
    }

    function _canCall(
        AssetWList storage wl,
        uint256 level,
        address asset
    ) internal view returns (bool) {
        return wl.acl[level][asset] || wl.acl[_ANY32][asset];
    }

    // Creator white list
    struct CreatorWList {
        mapping(address => bool) acl;
    }

    function _permit(CreatorWList storage wl, address creator) internal {
        wl.acl[creator] = true;
    }

    function _forbid(CreatorWList storage wl, address creator) internal {
        wl.acl[creator] = false;
    }

    function _canCall(CreatorWList storage wl, address creator) internal view returns (bool) {
        return wl.acl[creator] || wl.acl[_ANY20];
    }
}
