// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {TaskExecutor} from "../TaskExecutor.sol";
import {GasProfiler} from "./debug/GasProfiler.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract TaskExecutorMock is TaskExecutor, GasProfiler {
    using Address for address;
    event RecordActionResult(bytes value);

    constructor(address payable _owner, address _comptroller) TaskExecutor(_owner, _comptroller) {}

    function execMock(
        address[] calldata tokensIn,
        uint256[] calldata amountsIn,
        address to,
        bytes memory data
    ) external payable returns (bytes memory result) {
        _setBase();
        _chargeExecutionFee(tokensIn, amountsIn);
        result = to.functionDelegateCall(data);
        _deltaGas("Gas");
        emit RecordActionResult(result);
    }

    function callMock(address to, bytes memory data) external payable returns (bytes memory result) {
        result = to.functionCallWithValue(data, 0);
    }

    function getFundQuotas(address[] calldata funds) external view returns (uint256[] memory) {
        uint256[] memory quotas = new uint256[](funds.length);
        for (uint256 i = 0; i < funds.length; i++) {
            quotas[i] = _getFundQuota(funds[i]);
        }
        return quotas;
    }

    function getDealingAssetList() external view returns (address[] memory) {
        return _getDealingAssets();
    }
}
