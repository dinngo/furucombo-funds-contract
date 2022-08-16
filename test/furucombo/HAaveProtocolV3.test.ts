import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  FurucomboRegistry,
  IERC20,
  HAaveProtocolV3,
  IATokenV3,
  SimpleToken,
  IPool,
} from '../../typechain';

import { DAI_TOKEN, ADAI_V3_TOKEN, AAVEPROTOCOL_V3_PROVIDER } from '../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  balanceDelta,
  getHandlerReturn,
  expectEqWithinBps,
  tokenProviderQuick,
} from '../utils/utils';

describe('Aave V3', function () {
  const aTokenAddress = ADAI_V3_TOKEN;
  const tokenAddress = DAI_TOKEN;
  const ATOKEN_DUST = ether('0.00001');

  let owner: Wallet;
  let user: Wallet;

  let token: IERC20;
  let aToken: IATokenV3;
  let mockToken: SimpleToken;
  let providerAddress: Signer;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hAaveV3: HAaveProtocolV3;
  let pool: IPool;

  let userBalance: BigNumber;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    providerAddress = await tokenProviderQuick(tokenAddress);
    token = await ethers.getContractAt('IERC20', tokenAddress);
    aToken = await ethers.getContractAt('IATokenV3', aTokenAddress);
    mockToken = await (await ethers.getContractFactory('SimpleToken')).deploy();
    await mockToken.deployed();

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    hAaveV3 = await (await ethers.getContractFactory('HAaveProtocolV3')).deploy();
    await hAaveV3.deployed();
    await registry.register(hAaveV3.address, asciiToHex32('HAaveProtocolV3'));

    const provider = await ethers.getContractAt('IPoolAddressesProvider', AAVEPROTOCOL_V3_PROVIDER);
    pool = await ethers.getContractAt('IPool', await provider.getPool());
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Supply', function () {
    beforeEach(async function () {
      userBalance = await ethers.provider.getBalance(user.address);
    });

    describe('Token', function () {
      it('normal', async function () {
        const value = ether('10');
        const to = hAaveV3.address;
        const data = simpleEncode('supply(address,uint256)', [token.address, value]);

        await token.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expectEqWithinBps(await aToken.balanceOf(user.address), value, 1);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
        await profileGas(receipt);
      });

      it('max amount', async function () {
        const value = ether('10');
        const to = hAaveV3.address;
        const data = simpleEncode('supply(address,uint256)', [token.address, constants.MaxUint256]);

        await token.connect(providerAddress).transfer(proxy.address, value);
        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expectEqWithinBps(await aToken.balanceOf(user.address), value, 1);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
        await profileGas(receipt);
      });

      it('should revert: not supported token', async function () {
        const value = ether('10');
        const to = hAaveV3.address;
        const data = simpleEncode('supply(address,uint256)', [mockToken.address, value]);
        await mockToken.connect(owner).transfer(proxy.address, value);
        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HAaveProtocolV3_General: aToken should not be zero address'
        );
      });
    });
  });

  describe('Withdraw', function () {
    var supplyAmount = ether('5');

    describe('Token', function () {
      beforeEach(async function () {
        await token.connect(providerAddress).approve(pool.address, supplyAmount);
        await pool.connect(providerAddress).supply(token.address, supplyAmount, user.address, 0);

        supplyAmount = await aToken.balanceOf(user.address);
      });

      it('partial', async function () {
        const value = supplyAmount.div(BigNumber.from(2));
        const to = hAaveV3.address;
        const data = simpleEncode('withdraw(address,uint256)', [token.address, value]);

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

        // Verify handler return
        expect(value).to.be.eq(handlerReturn);

        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);

        // Verify user balance
        expect(tokenUserAfter).to.be.eq(value);
        expectEqWithinBps(aTokenUserAfter, supplyAmount.sub(value), 1);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
        await profileGas(receipt);
      });

      it('max amount', async function () {
        const value = supplyAmount.div(BigNumber.from(2));
        const to = hAaveV3.address;
        const data = simpleEncode('withdraw(address,uint256)', [token.address, constants.MaxUint256]);
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

        // Verify handler return
        // Because AToken could be increase by timestamp in proxy
        expectEqWithinBps(handlerReturn, value, 1);

        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);

        // Verify user balance
        expect(tokenUserAfter).to.be.eq(handlerReturn);
        expectEqWithinBps(aTokenUserAfter, supplyAmount.sub(handlerReturn), 1);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
        await profileGas(receipt);
      });

      it('whole', async function () {
        const value = constants.MaxUint256;
        const to = hAaveV3.address;
        const data = simpleEncode('withdraw(address,uint256)', [token.address, value]);
        await aToken.connect(user).transfer(proxy.address, await aToken.connect(user).balanceOf(user.address));
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
        expect(handlerReturn).to.be.gte(supplyAmount);

        // Verify proxy balance
        expect(await aToken.balanceOf(proxy.address)).to.be.eq(0);
        expect(await token.balanceOf(proxy.address)).to.be.eq(0);

        // Verify user balance
        expect(aTokenUserAfter).to.be.lt(ATOKEN_DUST);
        expect(tokenUserAfter).to.be.eq(handlerReturn);
        expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
        await profileGas(receipt);
      });

      it('should revert: not enough balance', async function () {
        const value = supplyAmount.add(ether('10'));
        const to = hAaveV3.address;
        const data = simpleEncode('withdraw(address,uint256)', [token.address, value]);

        await aToken.connect(user).transfer(proxy.address, await aToken.connect(user).balanceOf(user.address));
        await proxy.updateTokenMock(aToken.address);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV3_withdraw: 32');
      });

      it('should revert: not supported token', async function () {
        const value = supplyAmount.add(ether('10'));
        const to = hAaveV3.address;
        const data = simpleEncode('withdraw(address,uint256)', [mockToken.address, value]);

        await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
          'HAaveProtocolV3_General: aToken should not be zero address'
        );
      });
    });
  });
});
