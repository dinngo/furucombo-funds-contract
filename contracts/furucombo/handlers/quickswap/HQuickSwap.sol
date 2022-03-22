// SPDX-License-Identifier: MIT

pragma solidity 0.8.13;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUniswapV2Router02} from "../../../interfaces/IUniswapV2Router02.sol";
import {UniswapV2Library} from "./libraries/UniswapV2Library.sol";
import {HandlerBase} from "../HandlerBase.sol";

contract HQuickSwap is HandlerBase {
    using SafeERC20 for IERC20;

    // prettier-ignore
    address public constant UNISWAPV2_ROUTER = 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;

    function getContractName() public pure override returns (string memory) {
        return "HQuickSwap";
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    )
        external
        payable
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        _notMaticToken(tokenA);
        _notMaticToken(tokenB);

        // Get uniswapV2 router
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAPV2_ROUTER);

        // Approve token
        amountADesired = _getBalance(tokenA, amountADesired);
        amountBDesired = _getBalance(tokenB, amountBDesired);
        _tokenApprove(tokenA, UNISWAPV2_ROUTER, amountADesired);
        _tokenApprove(tokenB, UNISWAPV2_ROUTER, amountBDesired);

        // Add liquidity
        try
            router.addLiquidity(
                tokenA,
                tokenB,
                amountADesired,
                amountBDesired,
                amountAMin,
                amountBMin,
                address(this),
                block.timestamp
            )
        returns (uint256 ret1, uint256 ret2, uint256 ret3) {
            amountA = ret1;
            amountB = ret2;
            liquidity = ret3;
        } catch Error(string memory reason) {
            _revertMsg("addLiquidity", reason);
        } catch {
            _revertMsg("addLiquidity");
        }
        _tokenApproveZero(tokenA, UNISWAPV2_ROUTER);
        _tokenApproveZero(tokenB, UNISWAPV2_ROUTER);

        // Update involved token
        address pair = UniswapV2Library.pairFor(
            router.factory(),
            tokenA,
            tokenB
        );
        _updateToken(pair);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external payable returns (uint256 amountA, uint256 amountB) {
        // Get uniswapV2 router
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAPV2_ROUTER);
        address pair = UniswapV2Library.pairFor(
            router.factory(),
            tokenA,
            tokenB
        );

        // Approve token
        liquidity = _getBalance(pair, liquidity);
        _tokenApprove(pair, UNISWAPV2_ROUTER, liquidity);

        // remove liquidity
        try
            router.removeLiquidity(
                tokenA,
                tokenB,
                liquidity,
                amountAMin,
                amountBMin,
                address(this),
                block.timestamp
            )
        returns (uint256 ret1, uint256 ret2) {
            amountA = ret1;
            amountB = ret2;
        } catch Error(string memory reason) {
            _revertMsg("removeLiquidity", reason);
        } catch {
            _revertMsg("removeLiquidity");
        }
        _tokenApproveZero(pair, UNISWAPV2_ROUTER);

        // Update involved token
        _updateToken(tokenA);
        _updateToken(tokenB);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path
    ) external payable returns (uint256 amount) {
        _requireMsg(
            path.length >= 2,
            "swapExactTokensForTokens",
            "invalid path"
        );
        address tokenIn = path[0];
        _notMaticToken(tokenIn);

        // Get uniswapV2 router
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAPV2_ROUTER);

        // Approve token
        amountIn = _getBalance(tokenIn, amountIn);
        _tokenApprove(tokenIn, UNISWAPV2_ROUTER, amountIn);

        try
            router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp
            )
        returns (uint256[] memory amounts) {
            amount = amounts[amounts.length - 1];
        } catch Error(string memory reason) {
            _revertMsg("swapExactTokensForTokens", reason);
        } catch {
            _revertMsg("swapExactTokensForTokens");
        }
        _tokenApproveZero(tokenIn, UNISWAPV2_ROUTER);

        // From the 2nd token of path, because path[0] will be update by previous cubes
        for (uint256 i = 0; i < path.length; i++) {
            _updateToken(path[i]);
        }
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path
    ) external payable returns (uint256 amount) {
        _requireMsg(
            path.length >= 2,
            "swapTokensForExactTokens",
            "invalid path"
        );
        address tokenIn = path[0];
        _notMaticToken(tokenIn);

        // Get uniswapV2 router
        IUniswapV2Router02 router = IUniswapV2Router02(UNISWAPV2_ROUTER);

        // if amount == type(uint256).max return balance of Proxy
        amountInMax = _getBalance(tokenIn, amountInMax);

        // Approve token
        _tokenApprove(tokenIn, UNISWAPV2_ROUTER, amountInMax);

        try
            router.swapTokensForExactTokens(
                amountOut,
                amountInMax,
                path,
                address(this),
                block.timestamp
            )
        returns (uint256[] memory amounts) {
            amount = amounts[0];
        } catch Error(string memory reason) {
            _revertMsg("swapTokensForExactTokens", reason);
        } catch {
            _revertMsg("swapTokensForExactTokens");
        }
        _tokenApproveZero(tokenIn, UNISWAPV2_ROUTER);

        // From the 2nd token of path, because path[0] will be update by previous cubes
        for (uint256 i = 0; i < path.length; i++) {
            _updateToken(path[i]);
        }
    }
}
