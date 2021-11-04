// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library Whitelist {
    bytes32 internal constant ANY = bytes32(type(uint256).max);

    // Action Whitelist
    struct ActionWList {
        mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => bool))) acl;
    }

    function canCall(
        ActionWList storage wl,
        uint256 _level,
        address _to,
        bytes32 sig
    ) internal view returns (bool) {
        bytes32 level = bytes32(_level);
        bytes32 to = bytes32(bytes20(_to));

        return
            wl.acl[level][to][sig] ||
            wl.acl[level][to][ANY] ||
            wl.acl[ANY][to][sig];
    }

    function permit(
        ActionWList storage wl,
        uint256 _level,
        address _to,
        bytes32 sig
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 to = bytes32(bytes20(_to));
        wl.acl[level][to][sig] = true;
    }

    function forbid(
        ActionWList storage wl,
        uint256 _level,
        address _to,
        bytes32 sig
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 to = bytes32(bytes20(_to));
        wl.acl[level][to][sig] = false;
    }

    // Asset white list
    struct AssetWList {
        mapping(bytes32 => mapping(bytes32 => bool)) acl;
    }

    function permit(
        AssetWList storage wl,
        uint256 _level,
        address _asset
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        wl.acl[level][asset] = true;
    }

    function forbid(
        AssetWList storage wl,
        uint256 _level,
        address _asset
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        wl.acl[level][asset] = false;
    }

    function canCall(
        AssetWList storage wl,
        uint256 _level,
        address _asset
    ) internal view returns (bool) {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        return wl.acl[level][asset] || wl.acl[ANY][asset];
    }

    // Manager white list
    struct ManagerWList {
        mapping(bytes32 => bool) acl;
    }

    function permit(ManagerWList storage wl, address _manager) internal {
        bytes32 manager = bytes32(bytes20(_manager));
        wl.acl[manager] = true;
    }

    function forbid(ManagerWList storage wl, address _manager) internal {
        bytes32 manager = bytes32(bytes20(_manager));
        wl.acl[manager] = false;
    }

    function canCall(ManagerWList storage wl, address _manager)
        internal
        view
        returns (bool)
    {
        bytes32 manager = bytes32(bytes20(_manager));
        return wl.acl[manager] || wl.acl[ANY];
    }
}
