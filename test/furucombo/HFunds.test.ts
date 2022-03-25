import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  IERC20,
  HFunds,
  IERC20Usdt,
} from '../../typechain';

import {
  DAI_TOKEN,
  NATIVE_TOKEN,
  USDT_TOKEN,
  LINK_TOKEN,
  MATIC_TOKEN,
} from './../utils/constants';

import {
  ether,
  simpleEncode,
  asciiToHex32,
  tokenProviderQuick,
  tokenProviderSushi,
  maticProviderWmatic,
  getHandlerReturn,
  profileGas,
  sendEther,
  balanceDelta,
} from './../utils/utils';

describe('Funds', function () {
  const token0Address = DAI_TOKEN;
  const token1Address = LINK_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token0: IERC20;
  let token1: IERC20;
  let provider0Address: Signer;
  let provider1Address: Signer;
  let usdtProviderAddress: Signer;
  let maticProviderAddress: Signer;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hFunds: HFunds;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user, someone] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      provider0Address = await tokenProviderQuick(token0Address);
      provider1Address = await tokenProviderSushi(token1Address);
      usdtProviderAddress = await tokenProviderQuick(USDT_TOKEN);
      maticProviderAddress = await maticProviderWmatic();

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      hFunds = await (await ethers.getContractFactory('HFunds')).deploy();
      await hFunds.deployed();
      await registry.register(hFunds.address, asciiToHex32('HFunds'));
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('update tokens', function () {
    beforeEach(async function () {
      token0 = await ethers.getContractAt('IERC20', token0Address);
      token1 = await ethers.getContractAt('IERC20', token1Address);

      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
    });

    it('normal', async function () {
      const token = [token0.address, token1.address];
      const value = [ether('100'), ether('200')];
      const to = hFunds.address;
      const data = simpleEncode('updateTokens(address[])', [token]);
      await token0.connect(provider0Address).transfer(proxy.address, value[0]);
      await token1.connect(provider1Address).transfer(proxy.address, value[1]);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('1'),
      });

      const handlerReturn = (await getHandlerReturn(receipt, ['uint256[]']))[0];
      // Verify token0
      expect(handlerReturn[0]).to.be.eq(value[0]);
      expect(await token0.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await token0.balanceOf(user.address)).to.be.eq(value[0]);

      // Verify token1
      expect(handlerReturn[1]).to.be.eq(value[1]);
      expect(await token1.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await token1.balanceOf(user.address)).to.be.eq(value[1]);

      await profileGas(receipt);
    });

    it('check return tokens', async function () {
      const token = [token0.address, token1.address];
      const value = [ether('100'), ether('200')];
      const to = hFunds.address;
      const data = simpleEncode('updateTokens(address[])', [token]);
      await token0.connect(provider0Address).transfer(proxy.address, value[0]);
      await token1.connect(provider1Address).transfer(proxy.address, value[1]);

      // Execution
      const tos = [to];
      const configs = [constants.HashZero];
      const datas = [data];
      const returnTokens = await proxy
        .connect(user)
        .callStatic.batchExec(tos, configs, datas, {
          value: ether('1'),
        });
      // Verify
      expect(returnTokens.length).to.be.eq(ether('0'));
    });

    it('should revert: native token - zero address', async function () {
      const token = [token0.address, constants.AddressZero];
      const to = hFunds.address;
      const data = simpleEncode('updateTokens(address[])', [token]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith(
        'Transaction reverted: function returned an unexpected amount of data'
      );
    });

    it('should revert: native token - 0xEEEE', async function () {
      const token = [token0.address, NATIVE_TOKEN];
      const to = hFunds.address;
      const data = simpleEncode('updateTokens(address[])', [token]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith(
        'Transaction reverted: function returned an unexpected amount of data'
      );
    });

    it('should revert: updateToken not support MRC20', async function () {
      const token = [token0.address, MATIC_TOKEN];
      const to = hFunds.address;
      const data = simpleEncode('updateTokens(address[])', [token]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('Not support matic token');
    });
  });

  describe('inject', function () {
    describe('single token', function () {
      let usdt: IERC20Usdt;
      beforeEach(async function () {
        token0 = await ethers.getContractAt('IERC20', token0Address);
        usdt = await ethers.getContractAt('IERC20Usdt', USDT_TOKEN);
      });

      it('normal', async function () {
        const token = [token0.address];
        const value = [ether('100')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);
        await token0.connect(provider0Address).transfer(user.address, value[0]);
        await token0.connect(user).approve(proxy.address, value[0]);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        const handlerReturn = (
          await getHandlerReturn(receipt, ['uint256[]'])
        )[0];
        expect(handlerReturn[0]).to.be.eq(value[0]);

        await expect(receipt)
          .to.emit(token0, 'Transfer')
          .withArgs(user.address, proxy.address, value[0]);

        await expect(receipt)
          .to.emit(token0, 'Transfer')
          .withArgs(proxy.address, user.address, value[0]);
        await profileGas(receipt);
      });

      it('USDT', async function () {
        const token = [usdt.address];
        const value = [BigNumber.from('1000000')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);
        await usdt
          .connect(usdtProviderAddress)
          .transfer(user.address, value[0]);
        await usdt.connect(user).approve(proxy.address, value[0]);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('0.1'),
        });

        const handlerReturn = (
          await getHandlerReturn(receipt, ['uint256[]'])
        )[0];
        expect(handlerReturn[0]).to.be.eq(value[0]);

        await expect(receipt)
          .to.emit(usdt, 'Transfer')
          .withArgs(user.address, proxy.address, value[0]);

        await expect(receipt)
          .to.emit(usdt, 'Transfer')
          .withArgs(user.address, proxy.address, value[0]);

        await profileGas(receipt);
      });

      it('return token', async function () {
        const token = [token0.address];
        const value = [ether('100')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);
        await token0.connect(provider0Address).transfer(user.address, value[0]);
        await token0.connect(user).approve(proxy.address, value[0]);

        // Execution
        const tos = [to];
        const configs = [constants.HashZero];
        const datas = [data];
        const returnTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas, {
            value: ether('0.1'),
          });

        // Verify
        expect(returnTokens.length).to.be.eq(ether('0'));
      });

      it('should revert: inject not support MRC20', async function () {
        const token = [MATIC_TOKEN];
        const value = [ether('1')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);

        await expect(
          proxy.connect(user).execMock(to, data, {
            value: value[0],
          })
        ).to.be.revertedWith('Not support matic token');
      });
    });

    describe('multiple tokens', function () {
      beforeEach(async function () {
        token0 = await ethers.getContractAt('IERC20', token0Address);
        token1 = await ethers.getContractAt('IERC20', token1Address);
      });

      it('normal', async function () {
        const token = [token0.address, token1.address];
        const value = [ether('100'), ether('200')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);

        await token0.connect(provider0Address).transfer(user.address, value[0]);
        await token0.connect(user).approve(proxy.address, value[0]);
        await token1.connect(provider1Address).transfer(user.address, value[1]);
        await token1.connect(user).approve(proxy.address, value[1]);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: ether('1'),
        });

        const handlerReturn = (
          await getHandlerReturn(receipt, ['uint256[]'])
        )[0];
        expect(handlerReturn[0]).to.be.eq(value[0]);

        await expect(receipt)
          .to.emit(token0, 'Transfer')
          .withArgs(user.address, proxy.address, value[0]);

        await expect(receipt)
          .to.emit(token0, 'Transfer')
          .withArgs(proxy.address, user.address, value[0]);

        expect(handlerReturn[1]).to.be.eq(value[1]);

        await expect(receipt)
          .to.emit(token1, 'Transfer')
          .withArgs(user.address, proxy.address, value[1]);

        await expect(receipt)
          .to.emit(token1, 'Transfer')
          .withArgs(proxy.address, user.address, value[1]);

        await profileGas(receipt);
      });

      it('return tokens', async function () {
        const token = [token0.address, token1.address];
        const value = [ether('100'), ether('200')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);
        await token0.connect(provider0Address).transfer(user.address, value[0]);
        await token0.connect(user).approve(proxy.address, value[0]);
        await token1.connect(provider1Address).transfer(user.address, value[1]);
        await token1.connect(user).approve(proxy.address, value[1]);

        // Execution
        const tos = [to];
        const configs = [constants.HashZero];
        const datas = [data];

        const returnTokens = await proxy
          .connect(user)
          .callStatic.batchExec(tos, configs, datas, {
            value: ether('1'),
          });

        // Verify
        expect(returnTokens.length).to.be.eq(ether('0'));
      });

      it('should revert: inject not support MRC20', async function () {
        const token = [token0.address, MATIC_TOKEN];
        const value = [ether('100'), ether('1')];
        const to = hFunds.address;
        const data = simpleEncode('inject(address[],uint256[])', [
          token,
          value,
        ]);
        await token0.connect(provider0Address).transfer(user.address, value[0]);
        await token0.connect(user).approve(proxy.address, value[0]);

        await expect(
          proxy.connect(user).execMock(to, data, {
            value: value[0],
          })
        ).to.be.revertedWith('Not support matic token');
      });
    });
  });

  describe('get balance', function () {
    let usdt: IERC20Usdt;
    let token: IERC20;
    beforeEach(async function () {
      token = await ethers.getContractAt('IERC20', token0Address);
      usdt = await ethers.getContractAt('IERC20Usdt', USDT_TOKEN);
    });
    describe('Ether', async function () {
      it('normal', async function () {
        const value = ether('1');
        const to = hFunds.address;
        const data = simpleEncode('getBalance(address)', [
          constants.AddressZero,
        ]);

        await proxy.updateTokenMock(token.address);

        const receipt = await proxy.connect(user).execMock(to, data, {
          value: value,
        });

        const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];

        expect(handlerReturn).to.be.eq(value);

        await profileGas(receipt);
      });

      describe('token', function () {
        it('normal', async function () {
          const value = ether('1');
          const providerAddress = provider0Address;
          const to = hFunds.address;
          const data = simpleEncode('getBalance(address)', [token.address]);
          await token.connect(providerAddress).transfer(proxy.address, value);
          await proxy.updateTokenMock(token.address);
          const receipt = await proxy.connect(user).execMock(to, data, {
            value: ether('0.1'),
          });

          const handlerReturn = (
            await getHandlerReturn(receipt, ['uint256'])
          )[0];
          expect(handlerReturn).to.be.eq(value);
          await profileGas(receipt);
        });
      });
    });
  });

  describe('check slippage', function () {
    let token0: IERC20;
    let token1: IERC20;
    beforeEach(async function () {
      token0 = await ethers.getContractAt('IERC20', token0Address);
      token1 = await ethers.getContractAt('IERC20', token1Address);
    });

    it('normal', async function () {
      const token = [token0.address, token1.address];
      const value = [ether('10'), ether('10')];
      const to = hFunds.address;
      const data = simpleEncode('checkSlippage(address[],uint256[])', [
        token,
        value,
      ]);

      await token0.connect(provider0Address).transfer(proxy.address, value[0]);
      await token1.connect(provider1Address).transfer(proxy.address, value[1]);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('1'),
      });

      await profileGas(receipt);
    });

    it('should revert: token slippage', async function () {
      const token = [token0.address, token1.address, constants.AddressZero];
      const value = [ether('10'), ether('10'), ether('10')];
      const to = hFunds.address;
      const data = simpleEncode('checkSlippage(address[],uint256[])', [
        token,
        value,
      ]);

      const revertValue = ether('1');
      await token0
        .connect(provider0Address)
        .transfer(proxy.address, revertValue);
      await token1.connect(provider1Address).transfer(proxy.address, value[1]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('1'),
        })
      ).to.be.revertedWith(
        'HFunds_checkSlippage: error: 0_' + revertValue.toString()
      );
    });

    it('should revert: not support MRC20', async function () {
      const token = [token0.address, MATIC_TOKEN];
      const value = [ether('10'), ether('1')];
      const to = hFunds.address;
      const data = simpleEncode('checkSlippage(address[],uint256[])', [
        token,
        value,
      ]);

      await token0.connect(provider0Address).transfer(proxy.address, value[0]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('1'),
        })
      ).to.be.revertedWith('Not support matic token');
    });

    it('should revert: not support native token - zero address', async function () {
      const token = [token0.address, constants.AddressZero];
      const value = [ether('10'), ether('1')];
      const to = hFunds.address;
      const data = simpleEncode('checkSlippage(address[],uint256[])', [
        token,
        value,
      ]);

      await token0.connect(provider0Address).transfer(proxy.address, value[0]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('1'),
        })
      ).to.be.revertedWith(
        "VM Exception while processing transaction: reverted with reason string '_exec'"
      );
    });

    it('should revert: not support native token - 0xEEEE', async function () {
      const token = [token0.address, NATIVE_TOKEN];
      const value = [ether('10'), ether('1')];
      const to = hFunds.address;
      const data = simpleEncode('checkSlippage(address[],uint256[])', [
        token,
        value,
      ]);

      await token0.connect(provider0Address).transfer(proxy.address, value[0]);

      await expect(
        proxy.connect(user).execMock(to, data, {
          value: ether('1'),
        })
      ).to.be.revertedWith(
        "VM Exception while processing transaction: reverted with reason string '_exec'"
      );
    });
  });

  describe('return fund', function () {
    let usdt: IERC20Usdt;
    let token: IERC20;
    beforeEach(async function () {
      token = await ethers.getContractAt('IERC20', token0Address);
      usdt = await ethers.getContractAt('IERC20Usdt', USDT_TOKEN);
    });

    describe('multiple tokens', function () {
      let token0: IERC20Usdt;
      beforeEach(async function () {
        token0 = usdt;
        token1 = await ethers.getContractAt('IERC20', token1Address);
      });

      it('multiple tokens', async function () {
        const tokens = [token0.address, token1.address];
        const value = [BigNumber.from(10000000), ether('15')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          tokens,
          value,
        ]);

        await token0
          .connect(usdtProviderAddress)
          .transfer(proxy.address, value[0]);
        await token1
          .connect(provider1Address)
          .transfer(proxy.address, value[1]);

        const token0User = await token0.balanceOf(user.address);
        const token1User = await token1.balanceOf(user.address);
        const receipt = await proxy.connect(user).execMockNotRefund(to, data, {
          value: ether('0.1'),
        });

        await expect(receipt)
          .to.emit(token0, 'Transfer')
          .withArgs(proxy.address, user.address, value[0]);

        await expect(receipt)
          .to.emit(token1, 'Transfer')
          .withArgs(proxy.address, user.address, value[1]);

        const token0UserEnd = await token0.balanceOf(user.address);
        expect(token0UserEnd.sub(token0User)).to.be.eq(value[0]);

        const token1UserEnd = await token1.balanceOf(user.address);
        expect(token1UserEnd.sub(token1User)).to.be.eq(value[1]);
        await profileGas(receipt);
      });

      it('max amount', async function () {
        const value = [ether('15')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          [token1.address],
          [constants.MaxUint256],
        ]);

        await token1
          .connect(provider1Address)
          .transfer(proxy.address, value[0]);

        const token1User = await token1.balanceOf(user.address);
        const receipt = await proxy.connect(user).execMockNotRefund(to, data, {
          value: value[0],
        });

        await expect(receipt)
          .to.emit(token1, 'Transfer')
          .withArgs(proxy.address, user.address, value[0]);

        const token1UserEnd = await token1.balanceOf(user.address);
        expect(token1UserEnd.sub(token1User)).to.be.eq(value[0]);
        await profileGas(receipt);
      });

      it('zero case', async function () {
        const tokens = [token1.address];
        const value = [ether('0')];
        const to = hFunds.address;

        const data = simpleEncode('returnFunds(address[],uint256[])', [
          [token1.address],
          value,
        ]);

        await token1
          .connect(provider1Address)
          .transfer(proxy.address, value[0]);

        const token1User = await token1.balanceOf(user.address);

        const receipt = await proxy.connect(user).execMockNotRefund(to, data, {
          value: value[0],
        });

        const token1UserEnd = await token1.balanceOf(user.address);
        expect(token1UserEnd.sub(token1User)).to.be.eq(value[0]);
        await profileGas(receipt);
      });

      it('insufficient token', async function () {
        const tokens = [token1.address];
        const value = [ether('15')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          tokens,
          value,
        ]);

        await token1
          .connect(provider1Address)
          .transfer(proxy.address, ether('1'));

        await expect(
          proxy.connect(user).execMock(to, data, {
            value: ether('0.1'),
          })
        ).to.be.reverted;
      });

      it('should revert: not support MRC20', async function () {
        const tokens = [token0.address, MATIC_TOKEN];
        const value = [BigNumber.from(10000000), ether('1')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          tokens,
          value,
        ]);

        await token0
          .connect(usdtProviderAddress)
          .transfer(proxy.address, value[0]);

        await expect(
          proxy.connect(user).execMockNotRefund(to, data, {
            value: value[1],
          })
        ).to.be.revertedWith('Not support matic token');
      });

      it('should revert: not support native token - zero address', async function () {
        const tokens = [token0.address, constants.AddressZero];
        const value = [BigNumber.from(10000000), ether('1')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          tokens,
          value,
        ]);

        await token0
          .connect(usdtProviderAddress)
          .transfer(proxy.address, value[0]);

        await expect(
          proxy.connect(user).execMockNotRefund(to, data, {
            value: value[1],
          })
        ).to.be.revertedWith(
          "VM Exception while processing transaction: reverted with reason string '0_Address: call to non-contract'"
        );
      });

      it('should revert: not support native token - 0xEEEE', async function () {
        const tokens = [token0.address, NATIVE_TOKEN];
        const value = [BigNumber.from(10000000), ether('1')];
        const to = hFunds.address;
        const data = simpleEncode('returnFunds(address[],uint256[])', [
          tokens,
          value,
        ]);

        await token0
          .connect(usdtProviderAddress)
          .transfer(proxy.address, value[0]);

        await expect(
          proxy.connect(user).execMockNotRefund(to, data, {
            value: value[1],
          })
        ).to.be.revertedWith(
          "VM Exception while processing transaction: reverted with reason string '0_Address: call to non-contract'"
        );
      });
    });
  });
});
