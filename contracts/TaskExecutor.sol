// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
pragma experimental ABIEncoderV2;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ITaskExecutor} from "./interfaces/ITaskExecutor.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IPool} from "./interfaces/IPool.sol";
import {DestructibleAction} from "./utils/DestructibleAction.sol";
import {DelegateCallAction} from "./utils/DelegateCallAction.sol";
import {FundQuotaAction} from "./utils/FundQuotaAction.sol";
import {DealingAssetAction} from "./utils/DealingAssetAction.sol";
import {LibParam} from "./libraries/LibParam.sol";

contract TaskExecutor is
    ITaskExecutor,
    DestructibleAction,
    DelegateCallAction,
    FundQuotaAction,
    DealingAssetAction
{
    using Address for address;
    using SafeERC20 for IERC20;
    using LibParam for bytes32;

    // prettier-ignore
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 public constant PERCENTAGE_BASE = 1 ether;
    uint256 private constant _FEE_BASE = 1e4;
    IComptroller public immutable comptroller;

    constructor(address payable _owner, address _comptroller)
        DestructibleAction(_owner)
        DelegateCallAction()
    {
        // FIXME: get from caller or assign it directly
        comptroller = IComptroller(_comptroller);
    }

    /**
     * @notice task execution function.
     * @param tos The address of action.
     * @param configs The configurations of executing actions.
     * @param datas The action datas.
     */
    function batchExec(
        address[] calldata tokensIn,
        uint256[] calldata amountsIn,
        address[] calldata tos,
        bytes32[] calldata configs,
        bytes[] memory datas
    )
        external
        payable
        override
        delegateCallOnly
        quotaCleanUp
        assetCleanUp
        returns (address[] memory a)
    {
        _chargeExecutionFee(tokensIn, amountsIn);
        return _execs(tos, configs, datas);
    }

    /**
     * @notice The execution phase.
     * @param tos The address of action.
     * @param configs The configurations of executing actions.
     * @param datas The action datas.
     */
    function _execs(
        address[] memory tos,
        bytes32[] memory configs,
        bytes[] memory datas
    ) internal returns (address[] memory) {
        bytes32[256] memory localStack;
        uint256 index = 0;

        require(
            tos.length == datas.length,
            "TaskExecutor: Tos and datas length inconsistent"
        );
        require(
            tos.length == configs.length,
            "TaskExecutor: Tos and configs length inconsistent"
        );

        uint256 level = IPool(msg.sender).level();

        for (uint256 i = 0; i < tos.length; i++) {
            bytes32 config = configs[i];

            if (config.isDelegateCall()) {
                // check comptroller delegate call
                require(
                    comptroller.canDelegateCall(
                        level,
                        tos[i],
                        bytes4(datas[i])
                    ),
                    "TaskExecutor: invalid comptroller delegate call"
                );

                // Trim params from local stack depend on config
                _trimParams(datas[i], config, localStack, index);

                // Execute action by delegate call
                bytes memory result = tos[i].functionDelegateCall(
                    datas[i],
                    "TaskExecutor: TaskExecutor: low-level delegate call failed"
                );

                // Store return data from action to local stack
                index = _parseReturn(result, config, localStack, index);
            } else {
                // Decode eth value from data
                (uint256 ethValue, bytes memory _data) = _decodeEthValue(
                    datas[i]
                );

                // check comptroller contract call
                require(
                    comptroller.canContractCall(level, tos[i], bytes4(_data)),
                    "TaskExecutor: invalid comptroller contract call"
                );

                // Trim params from local stack depend on config
                _trimParams(_data, config, localStack, index);

                // Execute action by call
                bytes memory result = tos[i].functionCallWithValue(
                    _data,
                    ethValue,
                    "TaskExecutor: low-level call with value failed"
                );

                // Store return data from action to local stack depend on config
                index = _parseReturn(result, config, localStack, index);
            }
        }

        // verify dealing assets
        address[] memory dealingAssets = getDealingAssets();
        require(
            comptroller.isValidDealingAssets(level, dealingAssets),
            "TaskExecutor: invalid dealing asset"
        );
        return dealingAssets;
    }

    /**
     * @notice Trimming the execution parameter if needed.
     * @param data The execution data.
     * @param config The configuration.
     * @param localStack The stack the be referenced.
     * @param index Current element count of localStack.
     */
    function _trimParams(
        bytes memory data,
        bytes32 config,
        bytes32[256] memory localStack,
        uint256 index
    ) internal pure {
        if (config.isStatic()) {
            // Don't need to trim parameters if static
            return;
        }

        // Trim the execution data base on the configuration and stack content if dynamic
        // Fetch the parameter configuration from config
        (uint256[] memory refs, uint256[] memory params) = config.getParams();

        // Trim the data with the reference and parameters
        for (uint256 i = 0; i < refs.length; i++) {
            require(
                refs[i] < index,
                "TaskExecutor: Reference to out of localStack"
            );
            bytes32 ref = localStack[refs[i]];
            uint256 offset = params[i];
            uint256 base = PERCENTAGE_BASE;
            assembly {
                let loc := add(add(data, 0x20), offset)
                let m := mload(loc)
                // Adjust the value by multiplier if a dynamic parameter is not zero
                if iszero(iszero(m)) {
                    // Assert no overflow first
                    let p := mul(m, ref)
                    if iszero(eq(div(p, m), ref)) {
                        revert(0, 0)
                    } // require(p / m == ref)
                    ref := div(p, base)
                }
                mstore(loc, ref)
            }
        }
    }

    /**
     * @notice Parse the execution return data to the local stack if needed.
     * @param ret The return data.
     * @param config The configuration.
     * @param localStack The local stack to place the return values.
     * @param index The current tail.
     */
    function _parseReturn(
        bytes memory ret,
        bytes32 config,
        bytes32[256] memory localStack,
        uint256 index
    ) internal pure returns (uint256) {
        if (config.isReferenced()) {
            // If so, parse the output and place it into local stack
            uint256 num = config.getReturnNum();
            uint256 newIndex = _parse(localStack, ret, index);
            require(
                newIndex == index + num,
                "TaskExecutor: Return num and parsed return num not matched"
            );
            index = newIndex;
        }
        return index;
    }

    /**
     * @notice Parse the return data to the local stack.
     * @param localStack The local stack to place the return values.
     * @param ret The return data.
     * @param index The current tail.
     */
    function _parse(
        bytes32[256] memory localStack,
        bytes memory ret,
        uint256 index
    ) internal pure returns (uint256 newIndex) {
        uint256 len = ret.length;
        // The return value should be multiple of 32-bytes to be parsed.
        require(len % 32 == 0, "TaskExecutor: Illegal length for _parse");
        // Estimate the tail after the process.
        newIndex = index + len / 32;
        require(newIndex <= 256, "TaskExecutor: Stack overflow");
        assembly {
            let offset := shl(5, index)
            // Store the data into localStack
            for {
                let i := 0
            } lt(i, len) {
                i := add(i, 0x20)
            } {
                mstore(
                    add(localStack, add(i, offset)),
                    mload(add(add(ret, i), 0x20))
                )
            }
        }
    }

    /**
     * @notice decode eth value from the execution data.
     * @param data The execution data.
     */
    function _decodeEthValue(bytes memory data)
        internal
        pure
        returns (uint256, bytes memory)
    {
        return abi.decode(data, (uint256, bytes));
    }

    /**
     * @notice charge execution from input tokens
     * @param tokensIn The input tokens.
     * @param amountsIn The input token amounts.
     */
    function _chargeExecutionFee(
        address[] calldata tokensIn,
        uint256[] calldata amountsIn
    ) internal {
        // Check initial asset from white list
        uint256 level = IPool(msg.sender).level();
        require(
            comptroller.isValidInitialAssets(level, tokensIn),
            "TaskExecutor: invalid initial asset"
        );

        // collect execution fee to collector
        uint256 feePercentage = comptroller.execFeePercentage();
        address payable collector = payable(comptroller.execFeeCollector());

        for (uint256 i = 0; i < tokensIn.length; i++) {
            // make sure all quota should be zero at the begin
            require(
                isFundQuotaZero(tokensIn[i]),
                "TaskExecutor: quota is not zero"
            );

            // send fee to collector
            uint256 execFee = (amountsIn[i] * feePercentage) / _FEE_BASE;
            if (address(tokensIn[i]) == NATIVE_TOKEN) {
                collector.transfer(execFee);
            } else {
                IERC20(tokensIn[i]).safeTransfer(collector, execFee);
            }
            setFundQuota(tokensIn[i], amountsIn[i] - execFee);
        }
    }
}
