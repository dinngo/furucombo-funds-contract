import { Wallet } from 'ethers';
import { expect, assert } from 'chai';
import { ethers, deployments } from 'hardhat';
import { FurucomboProxyMock, FurucomboRegistry, IERC20, HParaSwapV5 } from '../../typechain';
import { DAI_TOKEN, USDC_TOKEN } from './../utils/constants';

import { ether, mulPercent, getHandlerReturn, tokenProviderQuick, getCallData, asciiToHex32 } from './../utils/utils';
import fetch from 'node-fetch';
import queryString from 'query-string';
import { Address } from 'hardhat-deploy/types';

const POLYGON_NETWORK_ID = 137;
const URL_PARASWAP = 'https://apiv5.paraswap.io/';
const IGNORE_CHECKS_PARAM = 'ignoreChecks=true';
const URL_PARASWAP_PRICE = URL_PARASWAP + 'prices';
const URL_PARASWAP_TRANSACTION = URL_PARASWAP + 'transactions/' + POLYGON_NETWORK_ID + '?' + IGNORE_CHECKS_PARAM;

const sleep = (delay: any) => new Promise((resolve) => setTimeout(resolve, delay));

async function getPriceData(
  srcToken: any,
  srcDecimals: any,
  destToken: any,
  destDecimals: any,
  amount: any,
  route = '',
  excludeDirectContractMethods = ''
) {
  const priceReq = queryString.stringifyUrl({
    url: URL_PARASWAP_PRICE,
    query: {
      srcToken: srcToken,
      srcDecimals: srcDecimals,
      destToken: destToken,
      destDecimals: destDecimals,
      amount: amount,
      network: POLYGON_NETWORK_ID,
      route: route,
      excludeDirectContractMethods: excludeDirectContractMethods,
    },
  });

  // Call Paraswap price API
  let priceResponse: any;
  let priceData: any;
  let succ = false;
  while (!succ) {
    priceResponse = await fetch(priceReq);
    priceData = await priceResponse.json();
    succ = priceResponse.ok;
    if (succ === false) {
      if (priceData.error === 'Server too busy') {
        // if the fail reason is 'Server too busy', try again
        console.log('ParaSwap Server too busy... retry');
        await sleep(500);
      } else {
        assert.fail(priceData.error);
      }
    }
  }

  return priceData;
}

async function getTransactionData(priceData: any, slippageInBps: any, userAddress: Address, txOrigin: Address) {
  const body = {
    srcToken: priceData.priceRoute.srcToken,
    srcDecimals: priceData.priceRoute.srcDecimals,
    destToken: priceData.priceRoute.destToken,
    destDecimals: priceData.priceRoute.destDecimals,
    srcAmount: priceData.priceRoute.srcAmount,
    slippage: slippageInBps,
    userAddress: userAddress,
    txOrigin: txOrigin,
    priceRoute: priceData.priceRoute,
  };

  const txResp = await fetch(URL_PARASWAP_TRANSACTION, {
    method: 'post',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const txData = await txResp.json();
  expect(txResp.ok, 'Paraswap transaction api response not ok: ' + txData.error).to.be.true;
  return txData;
}

describe('ParaSwapV5', function () {
  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;
  let provider: Wallet;

  let token1: IERC20;
  let token2: IERC20;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hParaSwap: HParaSwapV5;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    hParaSwap = await (await ethers.getContractFactory('HParaSwapV5')).deploy();
    await hParaSwap.deployed();
    await registry.register(hParaSwap.address, asciiToHex32('HParaSwapV5'));
    token1 = await ethers.getContractAt('IERC20', DAI_TOKEN);
    token2 = await ethers.getContractAt('IERC20', USDC_TOKEN);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('token to token', function () {
    const token1Address = DAI_TOKEN;
    const token1Decimal = 18;
    const token2Address = USDC_TOKEN;
    const token2Decimal = 6;
    const slippageInBps = 100; // 1%

    beforeEach(async function () {
      provider = await tokenProviderQuick(token1Address);
    });

    it('normal', async function () {
      // Get price
      const amount = ether('500');
      const to = hParaSwap.address;

      // Call Paraswap price API
      const priceData = await getPriceData(token1Address, token1Decimal, token2Address, token2Decimal, amount);

      const expectReceivedAmount = priceData.priceRoute.destAmount;

      // Call Paraswap transaction API
      const txData = await getTransactionData(priceData, slippageInBps, proxy.address, user.address);

      // Prepare handler data
      const callData = getCallData(hParaSwap, 'swap(address,uint256,address,bytes)', [
        token1Address,
        amount,
        token2Address,
        txData.data,
      ]);

      // Transfer token to proxy
      await token1.connect(provider).transfer(proxy.address, amount);

      // Execute
      const receipt = await proxy.connect(user).execMock(to, callData);

      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

      const userToken2Balance = await token2.balanceOf(user.address);

      // Verify user balance
      expect(handlerReturn).to.be.eq(userToken2Balance);
      expect(userToken2Balance).to.be.gt(mulPercent(expectReceivedAmount, 100 - slippageInBps / 100));

      // Proxy should not have remaining token
      expect(await token2.balanceOf(proxy.address)).to.be.eq(ether('0'));
    });
  }); // describe('token to token') end
});
