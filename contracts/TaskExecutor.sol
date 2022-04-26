// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ITaskExecutor} from "./interfaces/ITaskExecutor.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IFund} from "./interfaces/IFund.sol";
import {Errors} from "./utils/Errors.sol";
import {DestructibleAction} from "./utils/DestructibleAction.sol";
import {DelegateCallAction} from "./utils/DelegateCallAction.sol";
import {AssetQuotaAction} from "./utils/AssetQuotaAction.sol";
import {DealingAssetAction} from "./utils/DealingAssetAction.sol";
import {LibParam} from "./libraries/LibParam.sol";

contract TaskExecutor is ITaskExecutor, DestructibleAction, DelegateCallAction, AssetQuotaAction, DealingAssetAction {
    using Address for address;
    using SafeERC20 for IERC20;
    using LibParam for bytes32;

    // prettier-ignore
    address public constant NATIVE_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    uint256 public constant PERCENTAGE_BASE = 1 ether;
    uint256 private constant _FEE_BASE = 1e4;
    IComptroller public immutable comptroller;

    event ExecFee(address indexed fund, address indexed token, uint256 fee);

    constructor(address payable owner_, address comptroller_) DestructibleAction(owner_) DelegateCallAction() {
        comptroller = IComptroller(comptroller_);
    }

    /**
     * @notice task execution function.
     * @param tos_ The address of action.
     * @param configs_ The configurations of executing actions.
     * @param datas_ The action datas.
     */
    function batchExec(
        address[] calldata tokensIn_,
        uint256[] calldata amountsIn_,
        address[] calldata tos_,
        bytes32[] calldata configs_,
        bytes[] memory datas_
    ) external payable delegateCallOnly quotaCleanUp assetCleanUp returns (address[] memory a) {
        _chargeExecutionFee(tokensIn_, amountsIn_);
        return _execs(tos_, configs_, datas_);
    }

    /**
     * @notice The execution phase.
     * @param tos_ The address of action.
     * @param configs_ The configurations of executing actions.
     * @param datas_ The action datas.
     */
    function _execs(
        address[] memory tos_,
        bytes32[] memory configs_,
        bytes[] memory datas_
    ) internal returns (address[] memory) {
        bytes32[256] memory localStack;
        uint256 index = 0;

        Errors._require(tos_.length == datas_.length, Errors.Code.TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT);
        Errors._require(tos_.length == configs_.length, Errors.Code.TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT);

        uint256 level = IFund(msg.sender).level();

        for (uint256 i = 0; i < tos_.length; i++) {
            bytes32 config = configs_[i];

            if (config._isDelegateCall()) {
                // check comptroller delegate call
                Errors._require(
                    comptroller.canDelegateCall(level, tos_[i], bytes4(datas_[i])),
                    Errors.Code.TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
                );

                // Trim params from local stack depend on config
                _trimParams(datas_[i], config, localStack, index);

                // Execute action by delegate call
                bytes memory result = tos_[i].functionDelegateCall(
                    datas_[i],
                    "TaskExecutor: low-level delegate call failed"
                ); // use openzeppelin address delegate call, use error message directly

                // Store return data from action to local stack
                index = _parseReturn(result, config, localStack, index);
            } else {
                // Decode eth value from data
                (uint256 ethValue, bytes memory _data) = _decodeEthValue(datas_[i]);

                // check comptroller contract call
                Errors._require(
                    comptroller.canContractCall(level, tos_[i], bytes4(_data)),
                    Errors.Code.TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL
                );

                // Trim params from local stack depend on config
                _trimParams(_data, config, localStack, index);

                // Execute action by call
                bytes memory result = tos_[i].functionCallWithValue(
                    _data,
                    ethValue,
                    "TaskExecutor: low-level call with value failed"
                ); // use openzeppelin address value call, use error message directly

                // Store return data from action to local stack depend on config
                index = _parseReturn(result, config, localStack, index);
            }
        }

        // verify dealing assets
        address[] memory dealingAssets = _getDealingAssets();
        Errors._require(
            comptroller.isValidDealingAssets(level, dealingAssets),
            Errors.Code.TASK_EXECUTOR_INVALID_DEALING_ASSET
        );
        return dealingAssets;
    }

    /**
     * @notice Trimming the execution parameter if needed.
     * @param data_ The execution data.
     * @param config_ The configuration.
     * @param localStack_ The stack the be referenced.
     * @param index_ Current element count of localStack.
     */
    function _trimParams(
        bytes memory data_,
        bytes32 config_,
        bytes32[256] memory localStack_,
        uint256 index_
    ) internal pure {
        if (config_._isStatic()) {
            // Don't need to trim parameters if static
            return;
        }

        // Trim the execution data base on the configuration and stack content if dynamic
        // Fetch the parameter configuration from config
        (uint256[] memory refs, uint256[] memory params) = config_._getParams();

        // Trim the data with the reference and parameters
        for (uint256 i = 0; i < refs.length; i++) {
            Errors._require(refs[i] < index_, Errors.Code.TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK);
            bytes32 ref = localStack_[refs[i]];
            uint256 offset = params[i];
            uint256 base = PERCENTAGE_BASE;
            assembly {
                let loc := add(add(data_, 0x20), offset)
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
     * @param ret_ The return data.
     * @param config_ The configuration.
     * @param localStack_ The local stack to place the return values.
     * @param index_ The current tail.
     */
    function _parseReturn(
        bytes memory ret_,
        bytes32 config_,
        bytes32[256] memory localStack_,
        uint256 index_
    ) internal pure returns (uint256) {
        if (config_._isReferenced()) {
            // If so, parse the output and place it into local stack
            uint256 num = config_._getReturnNum();
            uint256 newIndex = _parse(localStack_, ret_, index_);
            Errors._require(
                newIndex == index_ + num,
                Errors.Code.TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED
            );
            index_ = newIndex;
        }
        return index_;
    }

    /**
     * @notice Parse the return data to the local stack.
     * @param localStack_ The local stack to place the return values.
     * @param ret_ The return data.
     * @param index_ The current tail.
     */
    function _parse(
        bytes32[256] memory localStack_,
        bytes memory ret_,
        uint256 index_
    ) internal pure returns (uint256 newIndex) {
        uint256 len = ret_.length;
        // The return value should be multiple of 32-bytes to be parsed.
        Errors._require(len % 32 == 0, Errors.Code.TASK_EXECUTOR_ILLEGAL_LENGTH_FOR_PARSE);
        // Estimate the tail after the process.
        newIndex = index_ + len / 32;
        Errors._require(newIndex <= 256, Errors.Code.TASK_EXECUTOR_STACK_OVERFLOW);
        assembly {
            let offset := shl(5, index_)
            // Store the data into localStack
            for {
                let i := 0
            } lt(i, len) {
                i := add(i, 0x20)
            } {
                mstore(add(localStack_, add(i, offset)), mload(add(add(ret_, i), 0x20)))
            }
        }
    }

    /**
     * @notice decode eth value from the execution data.
     * @param data_ The execution data.
     */
    function _decodeEthValue(bytes memory data_) internal pure returns (uint256, bytes memory) {
        return abi.decode(data_, (uint256, bytes));
    }

    /**
     * @notice charge execution from input tokens
     * @param tokensIn_ The input tokens.
     * @param amountsIn_ The input token amounts.
     */
    function _chargeExecutionFee(address[] calldata tokensIn_, uint256[] calldata amountsIn_) internal {
        // Check initial asset from white list
        uint256 level = IFund(msg.sender).level();
        Errors._require(
            comptroller.isValidInitialAssets(level, tokensIn_),
            Errors.Code.TASK_EXECUTOR_INVALID_INITIAL_ASSET
        );

        // collect execution fee to collector
        uint256 feePercentage = comptroller.execFeePercentage();
        address payable collector = payable(comptroller.execFeeCollector());

        for (uint256 i = 0; i < tokensIn_.length; i++) {
            // make sure all quota should be zero at the begin
            Errors._require(_isAssetQuotaZero(tokensIn_[i]), Errors.Code.TASK_EXECUTOR_NON_ZERO_QUOTA);

            // send fee to collector
            uint256 execFee = (amountsIn_[i] * feePercentage) / _FEE_BASE;
            IERC20(tokensIn_[i]).safeTransfer(collector, execFee);
            _setAssetQuota(tokensIn_[i], amountsIn_[i] - execFee);

            emit ExecFee(msg.sender, tokensIn_[i], execFee);
        }
    }
}
