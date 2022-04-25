// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibParam {
    bytes32 private constant _STATIC_MASK = 0x0100000000000000000000000000000000000000000000000000000000000000;
    bytes32 private constant _CALLTYPE_MASK = 0x0200000000000000000000000000000000000000000000000000000000000000;
    bytes32 private constant _PARAMS_MASK = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 private constant _REFS_MASK = 0x00000000000000000000000000000000000000000000000000000000000000FF;
    bytes32 private constant _RETURN_NUM_MASK = 0x00FF000000000000000000000000000000000000000000000000000000000000;

    uint256 private constant _REFS_LIMIT = 22;
    uint256 private constant _PARAMS_SIZE_LIMIT = 64;
    uint256 private constant _RETURN_NUM_OFFSET = 240;

    function _isStatic(bytes32 conf_) internal pure returns (bool) {
        return (conf_ & _STATIC_MASK == 0);
    }

    function _isReferenced(bytes32 conf_) internal pure returns (bool) {
        return !(_getReturnNum(conf_) == 0);
    }

    function _isDelegateCall(bytes32 conf_) internal pure returns (bool) {
        return (conf_ & _CALLTYPE_MASK == 0);
    }

    function _getReturnNum(bytes32 conf_) internal pure returns (uint256 num) {
        bytes32 temp = (conf_ & _RETURN_NUM_MASK) >> _RETURN_NUM_OFFSET;
        num = uint256(temp);
    }

    function _getParams(bytes32 conf_) internal pure returns (uint256[] memory refs, uint256[] memory params) {
        require(!_isStatic(conf_), "Static params");
        uint256 n = _REFS_LIMIT;
        while (conf_ & _REFS_MASK == _REFS_MASK && n > 0) {
            n--;
            conf_ = conf_ >> 8;
        }
        require(n > 0, "No dynamic param");
        refs = new uint256[](n);
        params = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            refs[i] = uint256(conf_ & _REFS_MASK);
            conf_ = conf_ >> 8;
        }
        uint256 _i = 0;
        for (uint256 k = 0; k < _PARAMS_SIZE_LIMIT; k++) {
            if (conf_ & _PARAMS_MASK != 0) {
                require(_i < n, "Location count exceeds ref count");
                params[_i] = k * 32 + 4;
                _i++;
            }
            conf_ = conf_ >> 1;
        }
        require(_i == n, "Location count less than ref count");
    }
}
