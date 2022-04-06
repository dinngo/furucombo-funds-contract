// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TaskExecutor} from "../TaskExecutor.sol";
import {GasProfiler} from "./debug/GasProfiler.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract TaskExecutorMock is TaskExecutor, GasProfiler {
    using Address for address;
    event RecordActionResult(bytes value);

    constructor(address payable owner_, address comptroller_) TaskExecutor(owner_, comptroller_) {}

    function execMock(
        address[] calldata tokensIn_,
        uint256[] calldata amountsIn_,
        address to_,
        bytes memory data_
    ) external payable returns (bytes memory result) {
        _setBase();
        _chargeExecutionFee(tokensIn_, amountsIn_);
        result = to_.functionDelegateCall(data_);
        _deltaGas("Gas");
        emit RecordActionResult(result);
    }

    function callMock(address to_, bytes memory data_) external payable returns (bytes memory result) {
        result = to_.functionCallWithValue(data_, 0);
    }

    function getFundQuotas(address[] calldata funds_) external view returns (uint256[] memory) {
        uint256[] memory quotas = new uint256[](funds_.length);
        for (uint256 i = 0; i < funds_.length; i++) {
            quotas[i] = _getFundQuota(funds_[i]);
        }
        return quotas;
    }

    function getDealingAssetList() external view returns (address[] memory) {
        return _getDealingAssets();
    }

    function parse(
        bytes32[256] memory localStack_,
        bytes memory ret_,
        uint256 index_
    ) external payable {
        _parse(localStack_, ret_, index_);
    }
}
