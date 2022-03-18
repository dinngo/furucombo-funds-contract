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
} from '../../typechain';

import {
  DAI_TOKEN,
  WMATIC_TOKEN,
  ADAI_V2_TOKEN,
  AWMATIC_V2,
  AAVEPROTOCOL_V2_PROVIDER,
} from './../utils/constants';

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
} from './../utils/utils';

describe('Aave V2', function () {
  const aTokenAddress = ADAI_V2_TOKEN;
  const tokenAddress = DAI_TOKEN;
  const awmaticAddress = AWMATIC_V2;
  const ATOKEN_DUST = ether('0.00001');

  let owner: Wallet;
  let user: Wallet;

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

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      providerAddress = await tokenProviderQuick(tokenAddress);
      wmaticProviderAddress = await tokenProviderQuick(WMATIC_TOKEN);
      token = await ethers.getContractAt('IERC20', tokenAddress);
      aToken = await ethers.getContractAt('IATokenV2', aTokenAddress);
      wmatic = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
      awmatic = await ethers.getContractAt('IATokenV2', awmaticAddress);
      mockToken = await (
        await ethers.getContractFactory('SimpleToken')
      ).deploy();
      await mockToken.deployed();

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hAaveV2 = await (
        await ethers.getContractFactory('HAaveProtocolV2')
      ).deploy();
      await hAaveV2.deployed();
      await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

      const provider = await ethers.getContractAt(
        'ILendingPoolAddressesProviderV2',
        AAVEPROTOCOL_V2_PROVIDER
      );

      lendingPool = await ethers.getContractAt(
        'ILendingPoolV2',
        await provider.getLendingPool()
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Deposit', function () {
    beforeEach(async function () {
      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
    });

    describe('Token', function () {
      it('normal', async function () {
        const value = ether('10');
        const to = hAaveV2.address;
        const data = simpleEncode('deposit(address,uint256)', [
          token.address,
          value,
        ]);

        await token.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });
        expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expectEqWithinBps(await aToken.balanceOf(user.address), value, 100);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0')
        );
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('10');
        const to = hAaveV2.address;
        const data = simpleEncode('deposit(address,uint256)', [
          token.address,
          constants.MaxUint256,
        ]);

        await token.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });
        expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expectEqWithinBps(await aToken.balanceOf(user.address), value, 100);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0')
        );
        profileGas(receipt);
      });

      it('should revert: not supported token', async function () {
        const value = ether('10');
        const to = hAaveV2.address;
        const data = simpleEncode('deposit(address,uint256)', [
          mockToken.address,
          value,
        ]);
        await mockToken.connect(owner).transfer(proxy.address, value);
        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HAaveProtocolV2_General: aToken should not be zero address'
        );
      });
    });
  });

  describe('Withdraw', function () {
    let depositAmount = ether('5');

    describe('Token', function () {
      beforeEach(async function () {
        await token
          .connect(providerAddress)
          .approve(lendingPool.address, depositAmount);
        await lendingPool
          .connect(providerAddress)
          .deposit(token.address, depositAmount, user.address, 0);

        depositAmount = await aToken.balanceOf(user.address);
      });

      it('partial', async function () {
        const value = depositAmount.div(BigNumber.from(2));
        const to = hAaveV2.address;
        const data = simpleEncode('withdraw(address,uint256)', [
          token.address,
          value,
        ]);

        await aToken.connect(user).transfer(proxy.address, value);
        await proxy.updateTokenMock(aToken.address);
        userBalance = await ethers.provider.getBalance(user.address);
        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        // Get handler return result
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const aTokenUserAfter = await aToken.balanceOf(user.address);
        const tokenUserAfter = await token.balanceOf(user.address);
        const interestMax = depositAmount
          .mul(BigNumber.from(1))
          .div(BigNumber.from(10000));

        // Verify handler return
        expect(value).to.be.eq(handlerReturn);
        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);

        // Verify user balance
        // (deposit - withdraw) <= aTokenAfter < (deposit + interestMax - withdraw)
        expect(aTokenUserAfter).to.be.gte(depositAmount.sub(value));
        expect(aTokenUserAfter).to.be.lt(
          depositAmount.add(interestMax).sub(value)
        );
        expect(tokenUserAfter).to.be.eq(value);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0')
        );
        profileGas(receipt);
      });

      it('max amount', async function () {
        const value = depositAmount.div(BigNumber.from(2));
        const to = hAaveV2.address;
        const data = simpleEncode('withdraw(address,uint256)', [
          token.address,
          constants.MaxUint256,
        ]);
        await aToken.connect(user).transfer(proxy.address, value);
        await proxy.updateTokenMock(aToken.address);
        userBalance = await ethers.provider.getBalance(user.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        // Get handler return result
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const aTokenUserAfter = await aToken.balanceOf(user.address);
        const tokenUserAfter = await token.balanceOf(user.address);
        const interestMax = depositAmount
          .mul(BigNumber.from(1))
          .div(BigNumber.from(10000));

        // Verify handler return
        // value  <= handlerReturn  <= value*1.01
        // Because AToken could be increase by timestamp in proxy
        expect(value).to.be.lte(handlerReturn);
        expect(mulPercent(value, 101)).to.be.gte(handlerReturn);

        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);
        // Verify user balance
        // (deposit - withdraw -1) <= aTokenAfter < (deposit + interestMax - withdraw)
        // NOTE: aTokenUserAfter == (depositAmount - withdraw - 1) (sometime, Ganache bug maybe)
        expect(aTokenUserAfter).to.be.gte(
          depositAmount.sub(handlerReturn.add(BigNumber.from(1)))
        );
        expect(aTokenUserAfter).to.be.lt(
          depositAmount.add(interestMax).sub(handlerReturn)
        );
        expect(tokenUserAfter).to.be.eq(handlerReturn);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0')
        );
        profileGas(receipt);
      });

      it('whole', async function () {
        const value = constants.MaxUint256;
        const to = hAaveV2.address;
        const data = simpleEncode('withdraw(address,uint256)', [
          token.address,
          value,
        ]);
        await aToken
          .connect(user)
          .transfer(
            proxy.address,
            await aToken.connect(user).balanceOf(user.address)
          );
        await proxy.updateTokenMock(aToken.address);
        userBalance = await ethers.provider.getBalance(user.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        // Get handler return result
        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
        const aTokenUserAfter = await aToken.balanceOf(user.address);
        const tokenUserAfter = await token.balanceOf(user.address);

        // Verify handler return
        expect(handlerReturn).to.be.gte(depositAmount);
        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);
        // Verify user balance
        expect(aTokenUserAfter).to.be.lt(ATOKEN_DUST);
        expect(tokenUserAfter).to.be.eq(handlerReturn);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(
          ether('0')
        );
        profileGas(receipt);
      });

      it('should revert: not enough balance', async function () {
        const value = depositAmount.add(ether('10'));
        const to = hAaveV2.address;
        const data = simpleEncode('withdraw(address,uint256)', [
          token.address,
          value,
        ]);

        await aToken
          .connect(user)
          .transfer(
            proxy.address,
            await aToken.connect(user).balanceOf(user.address)
          );
        await proxy.updateTokenMock(aToken.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HAaveProtocolV2_withdraw: 5'
        );
      });

      it('should revert: not supported token', async function () {
        const value = depositAmount.add(ether('10'));
        const to = hAaveV2.address;
        const data = simpleEncode('withdraw(address,uint256)', [
          mockToken.address,
          value,
        ]);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HAaveProtocolV2_General: aToken should not be zero address'
        );
      });
    });
  });
});
