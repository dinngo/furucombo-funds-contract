import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  IERC20,
  IUniswapV2Router02,
  HQuickSwap,
} from '../../typechain';

import {
  DAI_TOKEN,
  MATIC_TOKEN,
  WETH_TOKEN,
  QUICKSWAP_WMATIC_WETH,
  QUICKSWAP_DAI_WETH,
  QUICKSWAP_ROUTER,
} from './../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  balanceDelta,
  getHandlerReturn,
  tokenProviderSushi,
  getTimestampByTx,
} from './../utils/utils';

describe('QuickSwap Liquidity', function () {
  const tokenAAddress = WETH_TOKEN;
  const tokenBAddress = DAI_TOKEN;
  const lpToken0Address = QUICKSWAP_WMATIC_WETH;
  const lpToken1Address = QUICKSWAP_DAI_WETH;
  const routerAddress = QUICKSWAP_ROUTER;

  let owner: Wallet;
  let user: Wallet;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let lpTokenMatic: IERC20;
  let lpTokenToken: IERC20;
  let tokenAProvider: Signer;
  let tokenBProvider: Signer;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hQuickSwap: HQuickSwap;
  let router: IUniswapV2Router02;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;
  let tokenAUserAmount: BigNumber;
  let tokenBUserAmount: BigNumber;
  let uniTokenEthUserAmount: BigNumber;
  let lpTokenTokenUserAmount: BigNumber;
  let lpTokenUserAmount: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      tokenAProvider = await tokenProviderSushi(tokenAAddress);
      tokenBProvider = await tokenProviderSushi(tokenBAddress);

      tokenA = await ethers.getContractAt('IERC20', tokenAAddress);
      tokenB = await ethers.getContractAt('IERC20', tokenBAddress);
      lpTokenMatic = await ethers.getContractAt('IERC20', lpToken0Address);
      lpTokenToken = await ethers.getContractAt('IERC20', lpToken1Address);
      router = await ethers.getContractAt('IUniswapV2Router02', routerAddress);

      await tokenA.connect(tokenAProvider).transfer(user.address, ether('1'));
      await tokenB
        .connect(tokenBProvider)
        .transfer(user.address, ether('1000'));

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hQuickSwap = await (
        await ethers.getContractFactory('HQuickSwap')
      ).deploy();
      await hQuickSwap.deployed();
      await registry.register(hQuickSwap.address, asciiToHex32('HQuickSwap'));

      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
      tokenAUserAmount = await tokenA.balanceOf(user.address);
      tokenBUserAmount = await tokenB.balanceOf(user.address);
      uniTokenEthUserAmount = await lpTokenMatic.balanceOf(user.address);
      lpTokenTokenUserAmount = await lpTokenToken.balanceOf(user.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Add Token', function () {
    beforeEach(async function () {
      lpTokenUserAmount = await lpTokenToken.balanceOf(user.address);
    });

    it('normal', async function () {
      // Prepare handler data
      const tokenAAmount = ether('0.01');
      const tokenBAmount = ether('1000');
      const minTokenAAmount = ether('0.000001');
      const minTokenBAmount = ether('0.000001');
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'addLiquidity(address,address,uint256,uint256,uint256,uint256)',
        [
          tokenAAddress,
          tokenBAddress,
          tokenAAmount,
          tokenBAmount,
          minTokenAAmount,
          minTokenBAmount,
        ]
      );

      tokenAUserAmount = await tokenA.balanceOf(user.address);
      tokenBUserAmount = await tokenB.balanceOf(user.address);
      // Send tokens to proxy
      await tokenA.connect(user).transfer(proxy.address, tokenAAmount);
      await tokenB.connect(user).transfer(proxy.address, tokenBAmount);

      // Add tokens to cache for return user after handler execution
      await proxy.updateTokenMock(tokenA.address);
      await proxy.updateTokenMock(tokenB.address);

      // Execute handler
      const receipt = await proxy.connect(user).execMock(to, data);

      // Get handler return result
      const handlerReturn = await getHandlerReturn(receipt, [
        'uint256',
        'uint256',
        'uint256',
      ]);

      const tokenAUserAmountEnd = await tokenA.balanceOf(user.address);
      const tokenBUserAmountEnd = await tokenB.balanceOf(user.address);
      const lpTokenUserAmountEnd = await lpTokenToken.balanceOf(user.address);

      expect(handlerReturn[0]).to.be.eq(
        tokenAUserAmount.sub(tokenAUserAmountEnd)
      );
      expect(handlerReturn[1]).to.be.eq(
        tokenBUserAmount.sub(tokenBUserAmountEnd)
      );
      expect(handlerReturn[2]).to.be.eq(
        lpTokenUserAmountEnd.sub(lpTokenUserAmount)
      );

      // Verify user tokens
      expect(await tokenA.balanceOf(user.address)).to.be.lte(
        tokenAUserAmount.sub(minTokenAAmount)
      );
      expect(await tokenB.balanceOf(user.address)).to.be.lte(
        tokenBUserAmount.sub(minTokenBAmount)
      );

      // Verify proxy token should be zero
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(
        ether('0')
      );

      // TODO: Find out the exact number of uniToken for testing
      // Verify spent ether
      expect(await lpTokenToken.balanceOf(user.address)).to.be.gt(
        lpTokenTokenUserAmount
      );

      // Gas profile
      await profileGas(receipt);
    });

    it('max amount', async function () {
      // Prepare handler data
      const tokenAAmount = ether('0.01');
      const tokenBAmount = ether('1000');
      const minTokenAAmount = ether('0.000001');
      const minTokenBAmount = ether('0.000001');
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'addLiquidity(address,address,uint256,uint256,uint256,uint256)',
        [
          tokenAAddress,
          tokenBAddress,
          constants.MaxUint256,
          constants.MaxUint256,
          minTokenAAmount,
          minTokenBAmount,
        ]
      );

      tokenAUserAmount = await tokenA.balanceOf(user.address);
      tokenBUserAmount = await tokenB.balanceOf(user.address);
      // Send tokens to proxy
      await tokenA.connect(user).transfer(proxy.address, tokenAAmount);
      await tokenB.connect(user).transfer(proxy.address, tokenBAmount);

      // Add tokens to cache for return user after handler execution
      await proxy.updateTokenMock(tokenA.address);
      await proxy.updateTokenMock(tokenB.address);

      // Execute handler
      const receipt = await proxy.connect(user).execMock(to, data);

      // Get handler return result
      const handlerReturn = await getHandlerReturn(receipt, [
        'uint256',
        'uint256',
        'uint256',
      ]);

      const tokenAUserAmountEnd = await tokenA.balanceOf(user.address);
      const tokenBUserAmountEnd = await tokenB.balanceOf(user.address);
      const lpTokenUserAmountEnd = await lpTokenToken.balanceOf(user.address);

      expect(handlerReturn[0]).to.be.eq(
        tokenAUserAmount.sub(tokenAUserAmountEnd)
      );
      expect(handlerReturn[1]).to.be.eq(
        tokenBUserAmount.sub(tokenBUserAmountEnd)
      );
      expect(handlerReturn[2]).to.be.eq(
        lpTokenUserAmountEnd.sub(lpTokenUserAmount)
      );

      // Verify user tokens
      expect(await tokenA.balanceOf(user.address)).to.be.lte(
        tokenAUserAmount.sub(minTokenAAmount)
      );
      expect(await tokenB.balanceOf(user.address)).to.be.lte(
        tokenBUserAmount.sub(minTokenBAmount)
      );

      // Verify proxy token should be zero
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(
        ether('0')
      );

      // TODO: Find out the exact number of uniToken for testing
      // Verify spent ether
      expect(await lpTokenToken.balanceOf(user.address)).to.be.gt(
        lpTokenTokenUserAmount
      );

      // Gas profile
      await profileGas(receipt);
    });

    it('tokenA is matic token', async function () {
      // Prepare handler data
      const tokenAAmount = ether('0.01');
      const tokenBAmount = ether('1000');
      const minTokenAAmount = ether('0.000001');
      const minTokenBAmount = ether('0.000001');
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'addLiquidity(address,address,uint256,uint256,uint256,uint256)',
        [
          MATIC_TOKEN,
          tokenBAddress,
          tokenAAmount,
          tokenBAmount,
          minTokenAAmount,
          minTokenBAmount,
        ]
      );

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'Not support matic token'
      );
    });

    it('tokenB is matic token', async function () {
      // Prepare handler data
      const tokenAAmount = ether('0.01');
      const tokenBAmount = ether('1000');
      const minTokenAAmount = ether('0.000001');
      const minTokenBAmount = ether('0.000001');
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'addLiquidity(address,address,uint256,uint256,uint256,uint256)',
        [
          tokenAAddress,
          MATIC_TOKEN,
          tokenAAmount,
          tokenBAmount,
          minTokenAAmount,
          minTokenBAmount,
        ]
      );

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'Not support matic token'
      );
    });
  });

  describe('Remove Token', function () {
    let deadline: BigNumber;

    beforeEach(async function () {
      await tokenA
        .connect(tokenAProvider)
        .transfer(user.address, ether('0.01'));
      await tokenB
        .connect(tokenBProvider)
        .transfer(user.address, ether('1000'));

      await tokenA.connect(user).approve(router.address, ether('0.01'));
      const tx = await tokenB
        .connect(user)
        .approve(router.address, ether('1000'));

      // fixture and getBlocknumber conflict issue: https://github.com/EthWorks/Waffle/issues/382
      // replace getBlocknumber() with using tx to get timestamp
      const timestamp = await getTimestampByTx(tx);
      deadline = timestamp.add(BigNumber.from('100'));

      await router
        .connect(user)
        .addLiquidity(
          tokenA.address,
          tokenB.address,
          ether('0.01'),
          ether('1000'),
          BigNumber.from('1'),
          BigNumber.from('1'),
          user.address,
          deadline
        );
      tokenAUserAmount = await tokenA.balanceOf(user.address);
      tokenBUserAmount = await tokenB.balanceOf(user.address);
      lpTokenUserAmount = await lpTokenToken.balanceOf(user.address);
    });

    it('normal', async function () {
      // Get simulation result
      await lpTokenToken
        .connect(user)
        .approve(router.address, lpTokenUserAmount);
      const result = await router
        .connect(user)
        .callStatic.removeLiquidity(
          tokenA.address,
          tokenB.address,
          lpTokenUserAmount,
          BigNumber.from('1'),
          BigNumber.from('1'),
          user.address,
          deadline
        );

      // Send uniToken to proxy and prepare handler data
      await lpTokenToken
        .connect(user)
        .transfer(proxy.address, lpTokenUserAmount);
      await proxy.updateTokenMock(lpTokenToken.address);

      const value = lpTokenUserAmount;
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'removeLiquidity(address,address,uint256,uint256,uint256)',
        [
          tokenAAddress,
          tokenBAddress,
          value,
          BigNumber.from('1'),
          BigNumber.from('1'),
        ]
      );

      // Execute handler
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data);

      // Get handler return result
      const handlerReturn = await getHandlerReturn(receipt, [
        'uint256',
        'uint256',
      ]);
      const tokenAUserAmountEnd = await tokenA.balanceOf(user.address);
      const tokenBUserAmountEnd = await tokenB.balanceOf(user.address);

      expect(handlerReturn[0]).to.be.eq(
        tokenAUserAmountEnd.sub(tokenAUserAmount)
      );
      expect(handlerReturn[1]).to.be.eq(
        tokenBUserAmountEnd.sub(tokenBUserAmount)
      );

      // Verify user token
      expect(await tokenA.balanceOf(user.address)).to.be.eq(
        tokenAUserAmount.add(result[0])
      );
      expect(await tokenB.balanceOf(user.address)).to.be.eq(
        tokenBUserAmount.add(result[1])
      );
      expect(await lpTokenToken.balanceOf(user.address)).to.be.eq(ether('0'));

      // Verify proxy token should be zero
      expect(await lpTokenToken.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(
        ether('0')
      );

      // Verify spent matic
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(
        ether('0')
      );

      // Gas profile
      await profileGas(receipt);
    });

    it('max amount', async function () {
      // Get simulation result
      await lpTokenToken
        .connect(user)
        .approve(router.address, lpTokenUserAmount);
      const result = await router
        .connect(user)
        .callStatic.removeLiquidity(
          tokenA.address,
          tokenB.address,
          lpTokenUserAmount,
          BigNumber.from('1'),
          BigNumber.from('1'),
          user.address,
          deadline
        );

      // Send uniToken to proxy and prepare handler data
      await lpTokenToken
        .connect(user)
        .transfer(proxy.address, lpTokenUserAmount);
      await proxy.updateTokenMock(lpTokenToken.address);

      const to = hQuickSwap.address;
      const data = simpleEncode(
        'removeLiquidity(address,address,uint256,uint256,uint256)',
        [
          tokenAAddress,
          tokenBAddress,
          constants.MaxUint256,
          BigNumber.from('1'),
          BigNumber.from('1'),
        ]
      );

      // Execute handler
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data);

      // Get handler return result
      const handlerReturn = await getHandlerReturn(receipt, [
        'uint256',
        'uint256',
      ]);
      const tokenAUserAmountEnd = await tokenA.balanceOf(user.address);
      const tokenBUserAmountEnd = await tokenB.balanceOf(user.address);

      expect(handlerReturn[0]).to.be.eq(
        tokenAUserAmountEnd.sub(tokenAUserAmount)
      );
      expect(handlerReturn[1]).to.be.eq(
        tokenBUserAmountEnd.sub(tokenBUserAmount)
      );

      // Verify user token
      expect(await tokenA.balanceOf(user.address)).to.be.eq(
        tokenAUserAmount.add(result[0])
      );
      expect(await tokenB.balanceOf(user.address)).to.be.eq(
        tokenBUserAmount.add(result[1])
      );
      expect(await lpTokenToken.balanceOf(user.address)).to.be.eq(ether('0'));

      // Verify proxy token should be zero
      expect(await lpTokenToken.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(
        ether('0')
      );

      // Verify spent matic
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(
        ether('0')
      );

      // Gas profile
      await profileGas(receipt);
    });

    it('tokenA is matic token', async function () {
      const value = constants.MaxUint256;
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'removeLiquidity(address,address,uint256,uint256,uint256)',
        [
          MATIC_TOKEN,
          tokenBAddress,
          value,
          BigNumber.from('1'),
          BigNumber.from('1'),
        ]
      );

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'revert'
      );
    });

    it('tokenB is matic token', async function () {
      const value = constants.MaxUint256;
      const to = hQuickSwap.address;
      const data = simpleEncode(
        'removeLiquidity(address,address,uint256,uint256,uint256)',
        [
          tokenAAddress,
          MATIC_TOKEN,
          value,
          BigNumber.from('1'),
          BigNumber.from('1'),
        ]
      );
      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'revert'
      );
    });
  });
});
