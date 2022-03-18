import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  IERC20,
  HAaveProtocolV2,
  IATokenV2,
  SimpleToken,
  ILendingPoolV2,
  ICurveHandler,
  HCurve,
} from '../../typechain';

import {
  DAI_TOKEN,
  USDT_TOKEN,
  WMATIC_TOKEN,
  ADAI_V2_TOKEN,
  AWMATIC_V2,
  AAVEPROTOCOL_V2_PROVIDER,
  CURVE_AAVE_SWAP,
} from '../utils/constants';

import {
  ether,
  mulPercent,
  profileGas,
  simpleEncode,
  asciiToHex32,
  balanceDelta,
  getHandlerReturn,
  expectEqWithinBps,
  tokenProviderQuick,
  getCallData,
} from '../utils/utils';

describe('HCurve', function () {
  const aTokenAddress = ADAI_V2_TOKEN;

  const awmaticAddress = AWMATIC_V2;
  const ATOKEN_DUST = ether('0.00001');

  let owner: Wallet;
  let user: Wallet;

  let aaveSwap: ICurveHandler;
  let hCurve: HCurve;
  let token: IERC20;
  let wmatic: IERC20;
  let aToken: IATokenV2;
  let awmatic: IATokenV2;
  let mockToken: SimpleToken;
  let providerAddress: Signer;
  let wmaticProviderAddress: Signer;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hAaveV2: HAaveProtocolV2;

  let lendingPool: ILendingPoolV2;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;
  const slippage = BigNumber.from('3');
  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      aaveSwap = await ethers.getContractAt('ICurveHandler', CURVE_AAVE_SWAP);

      // // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hCurve = await (await ethers.getContractFactory('HCurve')).deploy();
      await hCurve.deployed();
      await registry.register(hCurve.address, asciiToHex32('HCurve'));

      // register HCurve callee
      await registry.setHandlerCalleeWhitelist(
        hCurve.address,
        aaveSwap.address,
        true
      );

      // Setup token and unlock provider
      // providerAddress = await tokenProviderQuick(tokenAddress);
      // wmaticProviderAddress = await tokenProviderQuick(WMATIC_TOKEN);
      // token = await ethers.getContractAt('IERC20', tokenAddress);
      // aToken = await ethers.getContractAt('IATokenV2', aTokenAddress);
      // wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
      // awmatic = await ethers.getContractAt('IATokenV2', awmaticAddress);
      // mockToken = await (
      //   await ethers.getContractFactory('SimpleToken')
      // ).deploy();
      // await mockToken.deployed();

      // // Setup proxy and Aproxy
      // registry = await (await ethers.getContractFactory('Registry')).deploy();
      // await registry.deployed();

      // proxy = await (
      //   await ethers.getContractFactory('FurucomboProxyMock')
      // ).deploy(registry.address);
      // await proxy.deployed();

      // hAaveV2 = await (
      //   await ethers.getContractFactory('HAaveProtocolV2')
      // ).deploy();
      // await hAaveV2.deployed();
      // await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

      // const provider = await ethers.getContractAt(
      //   'ILendingPoolAddressesProviderV2',
      //   AAVEPROTOCOL_V2_PROVIDER
      // );

      // lendingPool = await ethers.getContractAt(
      //   'ILendingPoolV2',
      //   await provider.getLendingPool()
      // );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Exchange underlying', function () {
    const token0Address = USDT_TOKEN;
    const token1Address = DAI_TOKEN;

    let token0User: BigNumber;
    let token1User: BigNumber;
    let providerAddress: any;
    let token0: IERC20, token1: IERC20;
    before(async function () {
      providerAddress = await tokenProviderQuick(token0Address);
      token0 = await ethers.getContractAt('IERC20', token0Address);
      token1 = await ethers.getContractAt('IERC20', token1Address);
    });

    beforeEach(async function () {
      token0User = await token0.balanceOf(user.address);
      token1User = await token1.balanceOf(user.address);
    });

    describe('aave pool', function () {
      it('Exact input swap USDT to DAI by exchangeUnderlying', async function () {
        const value = BigNumber.from('1000000');
        const answer = await aaveSwap[
          'get_dy_underlying(int128,int128,uint256)'
        ](2, 0, value);

        const data = getCallData(
          hCurve,
          'exchangeUnderlying(address,address,address,int128,int128,uint256,uint256)',
          [
            aaveSwap.address,
            token0.address,
            token1.address,
            2,
            0,
            value,
            mulPercent(answer, BigNumber.from('100').sub(slippage)),
          ]
        );
        await token0.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);

        const receipt = await proxy
          .connect(user)
          .execMock(hCurve.address, data, {
            value: ether('1'), // Ensure handler can correctly deal with ether
          });

        // Get handler return result
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const token1UserEnd = await token1.balanceOf(user.address);
        expect(handlerReturn).to.be.eq(token1UserEnd.sub(token1User));

        expect(await token0.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token1.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token0.balanceOf(user.address)).to.be.eq(token0User);
        // get_dy_underlying flow is different from exchange_underlying,
        // so give 1*10^12 tolerance for USDT/DAI case.
        expect(await token1.balanceOf(user.address)).to.be.gte(
          token1User.add(answer).sub(BigNumber.from('1000000000000'))
        );
        expect(await token1.balanceOf(user.address)).to.be.lte(
          mulPercent(token1User.add(answer), BigNumber.from('101'))
        );
      });
      it('Exact input swap USDT to DAI by exchangeUnderlying with max amount', async function () {
        const value = BigNumber.from('1000000');
        const answer = await aaveSwap[
          'get_dy_underlying(int128,int128,uint256)'
        ](2, 0, value);

        const data = getCallData(
          hCurve,
          'exchangeUnderlying(address,address,address,int128,int128,uint256,uint256)',
          [
            aaveSwap.address,
            token0.address,
            token1.address,
            2,
            0,
            constants.MaxUint256,
            mulPercent(answer, BigNumber.from('100').sub(slippage)),
          ]
        );
        await token0.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token0.address);

        const receipt = await proxy
          .connect(user)
          .execMock(hCurve.address, data, {
            value: ether('1'), // Ensure handler can correctly deal with ether
          });

        // Get handler return result
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const token1UserEnd = await token1.balanceOf(user.address);
        expect(handlerReturn).to.be.eq(token1UserEnd.sub(token1User));

        expect(await token0.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token1.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token0.balanceOf(user.address)).to.be.eq(token0User);
        // get_dy_underlying flow is different from exchange_underlying,
        // so give 1*10^12 tolerance for USDT/DAI case.
        expect(await token1.balanceOf(user.address)).to.be.gte(
          token1User.add(answer).sub(BigNumber.from('1000000000000'))
        );
        expect(await token1.balanceOf(user.address)).to.be.lte(
          mulPercent(token1User.add(answer), BigNumber.from('101'))
        );
      });
      it('should revert: not support MRC20', async function () {
        const value = BigNumber.from('1000000');
        const data = getCallData(
          hCurve,
          'exchangeUnderlying(address,address,address,int128,int128,uint256,uint256)',
          [aaveSwap.address, token0.address, token1.address, 2, 0, value, 0]
        );

        await expect(
          proxy.connect(user).execMock(hCurve.address, data, {
            value: value,
          })
        ).revertedWith('Not support matic token');
      });
    });
  });
});
