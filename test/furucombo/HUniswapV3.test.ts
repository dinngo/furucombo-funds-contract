import { constants, Wallet, BigNumber } from 'ethers';
import { HUniswapV3, IERC20, IQuoter, ISwapRouter, FurucomboProxyMock, FurucomboRegistry } from '../../typechain';
import {
  DAI_TOKEN,
  UNISWAPV3_ROUTER,
  UNISWAPV3_QUOTER,
  USDC_TOKEN,
  WMATIC_TOKEN,
  WETH_TOKEN,
} from './../utils/constants';
import { ethers, deployments } from 'hardhat';
import {
  ether,
  profileGas,
  getHandlerReturn,
  getCallData,
  tokenProviderSushi,
  mwei,
  asciiToHex32,
} from './../utils/utils';
import { expect } from 'chai';

describe('UniswapV3 Swap', function () {
  const tokenAddress = DAI_TOKEN;
  const tokenBAddress = USDC_TOKEN;
  const tokenCAddress = WETH_TOKEN;

  const fee = 100; // 0.01%
  const fee2 = 500; // 0.05%

  let balanceUser: BigNumber;
  let balanceProxy: BigNumber;
  let tokenUser: BigNumber;
  let tokenBUser: BigNumber;
  let tokenCUser: BigNumber;
  let tokenProvider: Wallet;
  let tokenProviderB: Wallet;
  let owner: Wallet, user: Wallet;

  let hUniswapV3: HUniswapV3;
  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;

  let token: IERC20, tokenB: IERC20, tokenC: IERC20;
  let ISwapRouter: ISwapRouter;
  let IQuoter: IQuoter;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments

    [owner, user] = await (ethers as any).getSigners();

    // Use pool from other swap to avoid lack of liquidity
    tokenProvider = await tokenProviderSushi(tokenAddress, tokenBAddress);
    tokenProviderB = await tokenProviderSushi(tokenCAddress, tokenBAddress);

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    hUniswapV3 = await (await ethers.getContractFactory('HUniswapV3')).deploy();
    await hUniswapV3.deployed();
    await registry.register(hUniswapV3.address, asciiToHex32('HUniswapV3'));

    ISwapRouter = await ethers.getContractAt('ISwapRouter', UNISWAPV3_ROUTER);
    IQuoter = await ethers.getContractAt('IQuoter', UNISWAPV3_QUOTER);

    token = await ethers.getContractAt('IERC20', tokenAddress);
    tokenB = await ethers.getContractAt('IERC20', tokenBAddress);
    tokenC = await ethers.getContractAt('IERC20', tokenCAddress);
  });

  beforeEach(async function () {
    await setupTest();

    balanceUser = await ethers.provider.getBalance(user.address);
    balanceProxy = await ethers.provider.getBalance(proxy.address);
    tokenUser = await token.balanceOf(user.address);
    tokenBUser = await tokenB.balanceOf(user.address);
    tokenCUser = await tokenC.balanceOf(user.address);
  });

  describe('Token to Token', function () {
    describe('Exact input', function () {
      describe('single path', function () {
        it('normal', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountIn = mwei('5000');
          const amountOutMinimum = BigNumber.from('1');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(tokenB.address);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            sqrtPriceLimitX96
          );

          // Execution
          const data = getCallData(hUniswapV3, 'exactInputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96,
          ]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactInput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            tokenB,
            tokenBUser,
            tokenC,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('max amount', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountIn = mwei('5000');
          const amountOutMinimum = BigNumber.from('1');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(tokenB.address);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactInputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            sqrtPriceLimitX96
          );

          // Execution
          const data = getCallData(hUniswapV3, 'exactInputSingle', [
            tokenIn,
            tokenOut,
            fee,
            constants.MaxUint256,
            amountOutMinimum,
            sqrtPriceLimitX96,
          ]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactInput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            token,
            tokenUser,
            tokenC,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('should revert: insufficient token', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountIn = mwei('5000');
          const amountOutMinimum = BigNumber.from('1');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProvider).transfer(proxy.address, amountIn.div(BigNumber.from('2')));
          await proxy.updateTokenMock(tokenB.address);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96,
          ]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('0_hUniswapV3_exactInputSingle: STF');
        });

        it('should revert: desired amount too high', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountIn = mwei('1');
          const amountOutMinimum = ether('1');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(tokenB.address);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96,
          ]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
            '0_hUniswapV3_exactInputSingle: Too little received'
          );
        });
      });

      describe('multi-path', function () {
        it('normal', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          //   Set swap info
          const tokens = [tokenAddress, tokenBAddress, tokenCAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountIn = value;
          const amountOutMinimum = BigNumber.from('1');
          await token.connect(tokenProvider).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(token.address);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactInput(path, amountIn);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInput', [path, amountIn, amountOutMinimum]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactInput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            token,
            tokenUser,
            tokenC,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('max amount', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          //   Set swap info
          const tokens = [tokenAddress, tokenBAddress, tokenCAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountIn = value;
          const amountOutMinimum = BigNumber.from('1');
          await token.connect(tokenProvider).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(token.address);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactInput(path, amountIn);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInput', [path, constants.MaxUint256, amountOutMinimum]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactInput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            token,
            tokenUser,
            tokenC,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('should revert: insufficient token', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          //   Set swap info
          const tokens = [tokenAddress, tokenBAddress, tokenCAddress];
          const fees = [BigNumber.from(500) /* 0.05% */, BigNumber.from(500) /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountIn = value;
          const amountOutMinimum = BigNumber.from('1');

          await token.connect(tokenProvider).transfer(proxy.address, amountIn.div(BigNumber.from('2')));
          await proxy.updateTokenMock(token.address);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInput', [path, amountIn, amountOutMinimum]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('0_hUniswapV3_exactInput: STF');
        });

        it('should revert: desired amount too high', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokens = [tokenAddress, tokenBAddress, tokenCAddress];
          const fees = [BigNumber.from(500) /* 0.05% */, BigNumber.from(500) /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountIn = value;
          const amountOutMinimum = ether('100');

          await token.connect(tokenProvider).transfer(proxy.address, amountIn);
          await proxy.updateTokenMock(token.address);

          // Execution
          const data = getCallData(hUniswapV3, 'exactInput', [path, amountIn, amountOutMinimum]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
            '0_hUniswapV3_exactInput: Too little received'
          );
        });
      });
    });

    describe('Exact output', function () {
      describe('single path', function () {
        it('normal', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountOut = ether('1');
          const amountInMaximum = mwei('10000');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountInMaximum);
          await proxy.updateTokenMock(tokenBAddress);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactOutputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            sqrtPriceLimitX96
          );

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            amountInMaximum,
            sqrtPriceLimitX96,
          ]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactOutput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            tokenB,
            amountInMaximum,
            tokenBUser,
            tokenC,
            amountOut,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('max amount', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountOut = ether('1');
          const amountInMaximum = mwei('10000');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountInMaximum);
          await proxy.updateTokenMock(tokenBAddress);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactOutputSingle(
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            sqrtPriceLimitX96
          );

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            constants.MaxUint256,
            sqrtPriceLimitX96,
          ]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactOutput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            tokenB,
            amountInMaximum,
            tokenBUser,
            tokenC,
            amountOut,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('should revert: insufficient token', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountOut = ether('100');
          const amountInMaximum = mwei('10000');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountInMaximum.div(BigNumber.from('2')));
          await proxy.updateTokenMock(tokenAddress);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            amountInMaximum,
            sqrtPriceLimitX96,
          ]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
            '0_hUniswapV3_exactOutputSingle: STF'
          );
        });

        it('should revert: desired amount too high', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokenIn = tokenBAddress;
          const tokenOut = tokenCAddress;
          const fee = BigNumber.from('500'); // 0.05%
          const amountOut = ether('100');
          const amountInMaximum = mwei('10000');
          const sqrtPriceLimitX96 = BigNumber.from('0');
          await tokenB.connect(tokenProviderB).transfer(proxy.address, amountInMaximum);
          await proxy.updateTokenMock(tokenAddress);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutputSingle', [
            tokenIn,
            tokenOut,
            fee,
            amountOut,
            amountInMaximum,
            sqrtPriceLimitX96,
          ]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
            '0_hUniswapV3_exactOutputSingle: STF'
          );
        });
      });

      describe('multi-path', function () {
        it('normal', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          // Path is in reverse order
          const tokens = [tokenCAddress, tokenBAddress, tokenAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountOut = ether('1');
          const amountInMaximum = ether('10000');
          await token.connect(tokenProvider).transfer(proxy.address, amountInMaximum);

          await proxy.updateTokenMock(tokenAddress);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactOutput(path, amountOut);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutput', [path, amountOut, amountInMaximum]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactOutput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            token,
            amountInMaximum,
            tokenUser,
            tokenC,
            amountOut,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('max amount', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokens = [tokenCAddress, tokenBAddress, tokenAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountOut = ether('1');
          const amountInMaximum = ether('10000');
          await token.connect(tokenProvider).transfer(proxy.address, amountInMaximum);
          await proxy.updateTokenMock(tokenAddress);

          // Estimate result
          const result = await IQuoter.callStatic.quoteExactOutput(path, amountOut);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutput', [path, amountOut, constants.MaxUint256]);

          const receipt = await proxy.connect(user).execMock(to, data);

          profileGas(receipt);

          const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

          // Verify
          await verifyExactOutput(
            proxy.address,
            handlerReturn,
            result,
            user.address,
            token,
            amountInMaximum,
            tokenUser,
            tokenC,
            amountOut,
            tokenCUser,
            (await ethers.provider.getBalance(user.address)).sub(balanceUser)
          );
        });

        it('should revert: insufficient token', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokens = [tokenCAddress, tokenBAddress, tokenAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountOut = ether('100');
          const amountInMaximum = ether('10000');
          await token.connect(tokenProvider).transfer(proxy.address, amountInMaximum.div(BigNumber.from('2')));
          await proxy.updateTokenMock(tokenAddress);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutput', [path, amountOut, amountInMaximum]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('0_hUniswapV3_exactOutput: STF');
        });

        it('should revert: desired amount too high', async function () {
          const value = ether('1');
          const to = hUniswapV3.address;

          // Set swap info
          const tokens = [tokenCAddress, tokenBAddress, tokenAddress];
          const fees = [BigNumber.from('500') /* 0.05% */, BigNumber.from('500') /* 0.05% */];
          const path = encodePath(tokens, fees);
          const amountOut = ether('100');
          const amountInMaximum = ether('10000');
          await token.connect(tokenProvider).transfer(proxy.address, amountInMaximum);
          await proxy.updateTokenMock(tokenAddress);

          // Execution
          const data = getCallData(hUniswapV3, 'exactOutput', [path, amountOut, amountInMaximum]);

          await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('0_hUniswapV3_exactOutput: STF');
        });
      });
    });
  });
});

function encodePath(path: string[], fees: BigNumber[]) {
  if (path.length != fees.length + 1) {
    throw new Error('path/fee lengths do not match');
  }

  let encoded = '0x';
  for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2);
    // 3 byte encoding of the fee
    // encoded += fees[i].toString(16).padStart(2 * 3, '0');
    encoded += ethers.utils.hexZeroPad(fees[i].toHexString(), 3).replace('0x', '');

    console.log('fee:' + fees[i]);
    console.log('fee after:' + ethers.utils.hexZeroPad(fees[i].toHexString(), 3).replace('0x', ''));
    console.log('encoded:' + encoded);
  }
  // encode the final token
  encoded += path[path.length - 1].slice(2);

  return encoded.toLowerCase();
}

async function verifyExactInput(
  proxyAddress: string,
  tokenOutAmt: BigNumber,
  tokenOutExpAmt: BigNumber,
  user: string,
  tokenIn: IERC20,
  tokenInBeforeBalance: BigNumber,
  tokenOut: IERC20,
  tokenOutBeforeBalance: BigNumber,
  nativeTokenUserBalance: BigNumber
) {
  // Verify if the amount of tokenOut is the same as pre-quote amount
  expect(tokenOutAmt).to.be.eq(tokenOutExpAmt);

  // Verify if the amount of tokenOut is greater than 0
  expect(tokenOutAmt).to.be.gt(0);

  // Verify if user does spend all amount of tokenIn
  expect(await tokenIn.balanceOf(user)).to.be.eq(tokenInBeforeBalance);

  // Verify if proxy swap all the tokenIn
  expect(await tokenIn.balanceOf(proxyAddress)).to.be.eq(0);

  // Verify if proxy does not keep any tokenOut
  expect(await tokenOut.balanceOf(proxyAddress)).to.be.eq(0);

  // Verify if user's tokenOut balance is correct
  expect(await tokenOut.balanceOf(user)).to.be.eq(tokenOutBeforeBalance.add(tokenOutExpAmt));

  // Verify if user's native token balance is correct
  expect(await nativeTokenUserBalance).to.be.eq(ether('0'));
}

async function verifyExactOutput(
  proxyAddress: string,
  tokenInAmt: BigNumber,
  tokenInExpAmt: BigNumber,
  user: string,
  tokenIn: IERC20,
  amountInMaximum: BigNumber,
  tokenInBeforeBalance: BigNumber,
  tokenOut: IERC20,
  amountOut: BigNumber,
  tokenOutBeforeBalance: BigNumber,
  nativeTokenUserBalance: BigNumber
) {
  // Verify if the amount of tokenIn is the same as pre-quote amount
  expect(tokenInAmt).to.be.eq(tokenInExpAmt);

  // Verify if user's remaining tokenIn balance is the same as calculated amount
  expect(await tokenIn.balanceOf(user)).to.be.eq(tokenInBeforeBalance.add(amountInMaximum).sub(tokenInExpAmt));

  // Verify if proxy does not keep any tokenIn
  expect(await tokenIn.balanceOf(proxyAddress)).to.be.eq(0);

  // Verify if proxy does not keep any tokenOut
  expect(await tokenOut.balanceOf(proxyAddress)).to.be.eq(0);

  // Verify if user's tokenOut balance is correct
  expect(await tokenOut.balanceOf(user)).to.be.eq(tokenOutBeforeBalance.add(amountOut));

  // Verify if user's native token balance is correct
  expect(await nativeTokenUserBalance).to.be.eq(0);
}
