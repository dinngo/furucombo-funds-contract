import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  IERC20,
  IUniswapV2Router02,
  HSushiSwap,
} from '../../typechain';

import {
  MATIC_TOKEN,
  WETH_TOKEN,
  SUSHISWAP_ROUTER,
  WMATIC_TOKEN,
  USDC_TOKEN,
  DAI_TOKEN,
  SUSHI_TOKEN,
} from './../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  balanceDelta,
  getHandlerReturn,
  tokenProviderSushi,
  mulPercent,
  decimal6,
} from './../utils/utils';

describe('Sushiswap Swap', function () {
  const slippage = BigNumber.from('3');
  const routerAddress = SUSHISWAP_ROUTER;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token: IERC20;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hSushiSwap: HSushiSwap;
  let router: IUniswapV2Router02;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user, someone] = await (ethers as any).getSigners();

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hSushiSwap = await (
        await ethers.getContractFactory('HSushiSwap')
      ).deploy();
      await hSushiSwap.deployed();
      await registry.register(hSushiSwap.address, asciiToHex32('HSushiSwap'));
      router = await ethers.getContractAt('IUniswapV2Router02', routerAddress);
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Matic to Token', function () {
    const tokenAddress = DAI_TOKEN;

    let userBalance: BigNumber;
    let proxyBalance: BigNumber;
    let tokenUser: BigNumber;

    beforeEach(async function () {
      token = await ethers.getContractAt('IERC20', tokenAddress);
      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
      tokenUser = await token.balanceOf(user.address);
    });

    describe('Exact input', function () {
      it('normal', async function () {
        const value = ether('1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsOut(value, path);

        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: value,
        });
        const handlerReturn = (
          await await getHandlerReturn(receipt, ['uint256'])
        )[0];

        expect(handlerReturn).to.be.eq(result[result.length - 1]);

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(result[result.length - 1])
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0').sub(ether('1'))
        );
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsOut(value, path);

        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [
            constants.MaxUint256,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: value,
        });

        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        expect(handlerReturn).to.be.eq(result[result.length - 1]);

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(result[result.length - 1])
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0').sub(ether('1'))
        );
        profileGas(receipt);
      });

      it('min amount too high', async function () {
        const value = ether('1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [value, result[result.length - 1].add(ether('0.1')), path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith(
          'HSushiSwap_swapExactETHForTokens: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );

        expect(await token.balanceOf(user.address)).to.be.eq(tokenUser);
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
      });

      it('invalid path', async function () {
        const value = ether('1');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith(
          'HSushiSwap_swapExactETHForTokens: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function () {
        const value = ether('1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, MATIC_TOKEN];
        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith('HSushiSwap_swapExactETHForTokens: Unspecified');
      });
    });

    describe('Exact output', function () {
      it('normal', async function () {
        const value = ether('1');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            buyAmt,
            path,
          ]
        );
        const receipt = await proxy.connect(user).execMock(to, data, {
          value: value,
        });

        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const userBalanceDelta = await balanceDelta(user.address, userBalance);

        expect(userBalanceDelta).to.be.eq(ether('0').sub(handlerReturn));

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(buyAmt)
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(ether('0').sub(result[0]));
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('1');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [constants.MaxUint256, buyAmt, path]
        );
        const receipt = await proxy.connect(user).execMock(to, data, {
          value: value,
        });

        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const userBalanceDelta = await balanceDelta(user.address, userBalance);

        expect(userBalanceDelta).to.be.eq(ether('0').sub(handlerReturn));

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(buyAmt)
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(ether('0').sub(result[0]));
        profileGas(receipt);
      });

      it('insufficient matic', async function () {
        const buyAmt = ether('100');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await router.connect(user).getAmountsIn(buyAmt, path);
        const value = result[0].sub(ether('0.01'));
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [value, buyAmt, path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith(
          'HSushiSwap_swapETHForExactTokens: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('invalid path', async function () {
        const value = ether('1');
        const buyAmt = ether('100');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [value, buyAmt, path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith(
          'HSushiSwap_swapETHForExactTokens: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function () {
        const value = ether('1');
        const buyAmt = ether('100');
        const to = hSushiSwap.address;
        const path = [WMATIC_TOKEN, MATIC_TOKEN];
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [value, buyAmt, path]
        );

        await expect(
          proxy.connect(user).execMock(to, data, { value: value })
        ).to.be.revertedWith('HSushiSwap_swapETHForExactTokens: Unspecified');
      });
    });
  });

  describe('Token to Matic', function () {
    const tokenAddress = DAI_TOKEN;

    let tokenUser: BigNumber;
    let provider: Signer;

    beforeEach(async function () {
      provider = await tokenProviderSushi(tokenAddress);
      token = await ethers.getContractAt('IERC20', tokenAddress);
      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
      tokenUser = await token.balanceOf(user.address);
    });

    describe('Exact input', function () {
      it('normal', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await router.connect(user).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);
        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const userBalanceDelta = await balanceDelta(user.address, userBalance);

        expect(userBalanceDelta).to.be.eq(ether('0').add(handlerReturn));

        expect(await token.balanceOf(user.address)).to.be.eq(tokenUser);
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(
          ether('0').add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [
            constants.MaxUint256,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const userBalanceDelta = await balanceDelta(user.address, userBalance);

        expect(userBalanceDelta).to.be.eq(ether('0').add(handlerReturn));

        expect(await token.balanceOf(user.address)).to.be.eq(tokenUser);
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(
          ether('0').add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('min output too high', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [value, result[result.length - 1].add(ether('0.1')), path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapExactTokensForETH: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
      });

      it('invalid path', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN, tokenAddress];
        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapExactTokensForETH: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN];
        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'Not support matic token'
        );
      });
    });

    describe('Exact output', function () {
      it('normal', async function () {
        const value = ether('1000');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [
            buyAmt,
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            path,
          ]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);
        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

        const userBalanceDelta = await balanceDelta(user.address, userBalance);
        expect(handlerReturn).to.be.eq(result[0]);

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(value).sub(result[0])
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(buyAmt);
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('1000');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [buyAmt, constants.MaxUint256, path]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);
        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

        const userBalanceDelta = await balanceDelta(user.address, userBalance);
        expect(handlerReturn).to.be.eq(result[0]);

        expect(await token.balanceOf(user.address)).to.be.eq(
          tokenUser.add(value).sub(result[0])
        );
        expect(await token.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
          ether('0')
        );
        expect(userBalanceDelta).to.be.eq(buyAmt);
        profileGas(receipt);
      });

      it('insufficient input token', async function () {
        const value = ether('0.01');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [buyAmt, value, path]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapTokensForExactETH: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('invalid path', async function () {
        const value = ether('1000');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN, tokenAddress];
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [buyAmt, value, path]
        );
        await token.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapTokensForExactETH: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function () {
        const value = ether('1000');
        const buyAmt = ether('0.1');
        const to = hSushiSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN];
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [buyAmt, value, path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'Not support matic token'
        );
      });
    });
  });

  describe('Token to Token', function () {
    const token0Address = DAI_TOKEN;
    const token1Address = SUSHI_TOKEN;

    let token0User: BigNumber;
    let token1User: BigNumber;
    let provider: Wallet;
    let token0: IERC20;
    let token1: IERC20;

    beforeEach(async function () {
      provider = await tokenProviderSushi(token0Address);
      token0 = await ethers.getContractAt('IERC20', token0Address);
      token1 = await ethers.getContractAt('IERC20', token1Address);
      token0User = await token0.balanceOf(user.address);
      token1User = await token1.balanceOf(user.address);
    });

    describe('Exact input', function () {
      it('normal', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await token0.connect(provider).transfer(someone.address, value);
        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

        expect(handlerReturn).to.be.eq(result[result.length - 1]);

        expect(await token0.balanceOf(user.address)).to.be.eq(token0User);
        expect(await token0.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(user.address)).to.be.eq(
          token1User.add(result[result.length - 1])
        );

        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [
            constants.MaxUint256,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );

        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await token0.connect(provider).transfer(someone.address, value);

        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        expect(handlerReturn).to.be.eq(result[result.length - 1]);

        expect(await token0.balanceOf(user.address)).to.be.eq(token0User);
        expect(await token0.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(user.address)).to.be.eq(
          token1User.add(result[result.length - 1])
        );

        profileGas(receipt);
      });

      it('min output too high', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await token0.connect(provider).transfer(someone.address, value);
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [value, result[result.length - 1].add(ether('10')), path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapExactTokensForTokens: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
      });

      it('identical addresses', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [token0Address, token0Address, token1Address];
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapExactTokensForTokens: UniswapV2Library: IDENTICAL_ADDRESSES'
        );
      });

      it('from matic token', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'Not support matic token'
        );
      });

      it('to matic token', async function () {
        const value = ether('100');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, MATIC_TOKEN];
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [value, BigNumber.from('1'), path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapExactTokensForTokens: Unspecified'
        );
      });
    });

    describe('Exact output', function () {
      it('normal', async function () {
        const value = ether('100');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [
            buyAmt,
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            path,
          ]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await token0.connect(provider).transfer(someone.address, value);

        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        expect(handlerReturn).to.be.eq(result[0]);

        expect(await token0.balanceOf(user.address)).to.be.eq(
          token0User.add(value).sub(result[0])
        );
        expect(await token0.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(user.address)).to.be.eq(
          token1User.add(buyAmt)
        );
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('100');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [buyAmt, constants.MaxUint256, path]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await token0.connect(provider).transfer(someone.address, value);

        const receipt = await proxy.connect(user).execMock(to, data);
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        expect(handlerReturn).to.be.eq(result[0]);

        expect(await token0.balanceOf(user.address)).to.be.eq(
          token0User.add(value).sub(result[0])
        );
        expect(await token0.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(proxy.address)).to.be.eq(ether('0'));
        expect(await token1.balanceOf(user.address)).to.be.eq(
          token1User.add(buyAmt)
        );
        profileGas(receipt);
      });

      it('excessive input amount', async function () {
        const value = ether('0.001');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [buyAmt, value, path]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapTokensForExactTokens: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('identical addresses', async function () {
        const value = ether('100');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [buyAmt, value, path]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapTokensForExactTokens: UniswapV2Library: IDENTICAL_ADDRESSES'
        );
      });

      it('from matic token', async function () {
        const value = ether('100');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [buyAmt, value, path]
        );

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'Not support matic token'
        );
      });

      it('to matic token', async function () {
        const value = ether('100');
        const buyAmt = ether('1');
        const to = hSushiSwap.address;
        const path = [token0Address, WMATIC_TOKEN, MATIC_TOKEN];
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [buyAmt, value, path]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HSushiSwap_swapTokensForExactTokens: Unspecified'
        );
      });
    });
  });

  describe('dealing token', function () {
    const token0Address = WETH_TOKEN;
    const token1Address = USDC_TOKEN;

    let provider: Wallet;
    let token0: IERC20;

    beforeEach(async function () {
      provider = await tokenProviderSushi(token0Address);
      token0 = await ethers.getContractAt('IERC20', token0Address);
    });

    describe('swap', function () {
      it('swapExactTokensForTokens', async function () {
        const value = ether('1');

        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        const expectTokens = [token0.address].concat(path);

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];
        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas);

        for (let i = 0; i < expectTokens.length; i++) {
          expect(expectTokens[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });

      it('swapExactETHForTokens', async function () {
        const value = ether('1');
        const path = [WMATIC_TOKEN, token0Address];
        const result = await router.connect(user).getAmountsOut(value, path);
        const data = simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];

        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas, {
            value: value,
          });

        for (let i = 0; i < path.length; i++) {
          expect(path[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });

      it('swapETHForExactTokens', async function () {
        const value = ether('10');
        const buyAmt = ether('0.001');
        const path = [WMATIC_TOKEN, token0Address];
        const result = await router.connect(user).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[])',
          [
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            buyAmt,
            path,
          ]
        );

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];

        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas, {
            value: value,
          });
        for (let i = 0; i < path.length; i++) {
          expect(path[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });

      it('swapExactTokensForETH', async function () {
        const value = ether('1');
        const path = [token0Address, WMATIC_TOKEN];

        const result = await router.connect(someone).getAmountsOut(value, path);

        const data = simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[])',
          [
            value,
            mulPercent(
              result[result.length - 1],
              BigNumber.from('100').sub(slippage)
            ),
            path,
          ]
        );

        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        const expectTokens = [token0.address].concat(path);

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];

        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas);
        for (let i = 0; i < expectTokens.length; i++) {
          expect(expectTokens[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });

      it('swapTokensForExactETH', async function () {
        const value = ether('1');
        const buyAmt = ether('1');
        const path = [token0Address, WMATIC_TOKEN];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[])',
          [
            buyAmt,
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            path,
          ]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        const expectTokens = [token0.address].concat(path);

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];
        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas);

        for (let i = 0; i < expectTokens.length; i++) {
          expect(expectTokens[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });

      it('swapTokensForExactTokens', async function () {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await router.connect(someone).getAmountsIn(buyAmt, path);
        const data = simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[])',
          [
            buyAmt,
            mulPercent(result[0], BigNumber.from('100').add(slippage)),
            path,
          ]
        );
        await token0.connect(provider).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);
        const expectTokens = [token0.address].concat(path);

        const tos = [hSushiSwap.address];
        const configs = [constants.HashZero];
        const datas = [data];

        const dealingTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas);

        for (let i = 0; i < expectTokens.length; i++) {
          expect(expectTokens[i]).to.be.eq(
            dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
          );
        }
      });
    });
  });
});
