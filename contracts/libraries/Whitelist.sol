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
        bytes4 sig
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
        bytes4 sig
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 to = bytes32(bytes20(_to));
        wl.acl[level][to][sig] = true;
    }

    function forbid(
        ActionWList storage wl,
        uint256 _level,
        address _to,
        bytes4 sig
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
        AssetWList storage awl,
        uint256 _level,
        address _asset
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        awl.acl[level][asset] = true;
    }

    function forbid(
        AssetWList storage awl,
        uint256 _level,
        address _asset
    ) internal {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        awl.acl[level][asset] = false;
    }

    function canCall(
        AssetWList storage awl,
        uint256 _level,
        address _asset
    ) internal view returns (bool) {
        bytes32 level = bytes32(_level);
        bytes32 asset = bytes32(bytes20(_asset));
        return awl.acl[level][asset] || awl.acl[ANY][asset];
    }

    // Manager white list
    struct ManagerWList {
        mapping(bytes32 => bool) acl;
    }

    function permit(ManagerWList storage mwl, address _manager) internal {
        bytes32 manager = bytes32(bytes20(_manager));
        mwl.acl[manager] = true;
    }

    function forbid(ManagerWList storage mwl, address _manager) internal {
        bytes32 manager = bytes32(bytes20(_manager));
        mwl.acl[manager] = false;
    }

    function canCall(ManagerWList storage mwl, address _manager)
        internal
        view
        returns (bool)
    {
        bytes32 manager = bytes32(bytes20(_manager));
        return mwl.acl[manager] || mwl.acl[ANY];
    }
}
