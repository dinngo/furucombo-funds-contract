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
        ActionWList storage wl_,
        uint256 level_,
        address to_,
        bytes4 sig_
    ) internal view returns (bool) {
        return wl_.acl[level_][to_][sig_] || wl_.acl[level_][to_][_ANY4] || wl_.acl[_ANY32][to_][sig_];
    }

    function _permit(
        ActionWList storage wl_,
        uint256 level_,
        address to_,
        bytes4 sig_
    ) internal {
        wl_.acl[level_][to_][sig_] = true;
    }

    function _forbid(
        ActionWList storage wl_,
        uint256 level_,
        address to_,
        bytes4 sig_
    ) internal {
        wl_.acl[level_][to_][sig_] = false;
    }

    // Asset white list
    struct AssetWList {
        mapping(uint256 => mapping(address => bool)) acl;
    }

    function _permit(
        AssetWList storage wl_,
        uint256 level_,
        address asset_
    ) internal {
        wl_.acl[level_][asset_] = true;
    }

    function _forbid(
        AssetWList storage wl_,
        uint256 level_,
        address asset_
    ) internal {
        wl_.acl[level_][asset_] = false;
    }

    function _canCall(
        AssetWList storage wl_,
        uint256 level_,
        address asset_
    ) internal view returns (bool) {
        return wl_.acl[level_][asset_] || wl_.acl[_ANY32][asset_];
    }

    // Creator white list
    struct CreatorWList {
        mapping(address => bool) acl;
    }

    function _permit(CreatorWList storage wl_, address creator_) internal {
        wl_.acl[creator_] = true;
    }

    function _forbid(CreatorWList storage wl_, address creator_) internal {
        wl_.acl[creator_] = false;
    }

    function _canCall(CreatorWList storage wl_, address creator_) internal view returns (bool) {
        return wl_.acl[creator_] || wl_.acl[_ANY20];
    }
}
