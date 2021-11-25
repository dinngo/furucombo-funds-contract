import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  FooFactory,
  Foo2Factory,
  Foo,
  Foo2,
  Foo3,
  Foo4,
  FooHandler,
  Foo2Handler,
  Foo3Handler,
  Foo4Handler,
  Foo6Handler,
} from '../../typechain';

import {
  DAI_TOKEN,
  WETH_TOKEN,
  MKR_TOKEN,
  NATIVE_TOKEN,
  WMATIC_TOKEN,
} from './../utils/constants';
import {
  ether,
  simpleEncode,
  asciiToHex32,
  balanceDelta,
  getGasConsumption,
} from './../utils/utils';

describe('Proxy', function () {
  let owner: Wallet;
  let user: Wallet;

  let proxy: FurucomboProxyMock;
  let registry: Registry;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();
    }
  );
  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  // setupTest will use the evm_snapshot to reset environment to speed up testing
  beforeEach(async function () {
    await setupTest();
  });

  describe('execute', function () {
    let fooHandler: FooHandler;
    let foo0: Foo;
    let foo1: Foo;
    let foo2: Foo;
    let fooFactory: FooFactory;

    beforeEach(async function () {
      fooFactory = await (
        await ethers.getContractFactory('FooFactory')
      ).deploy();
      await fooFactory.deployed();

      await fooFactory.createFoo();
      await fooFactory.createFoo();

      foo0 = await ethers.getContractAt('Foo', await fooFactory.addressOf(0));
      foo1 = await ethers.getContractAt('Foo', await fooFactory.addressOf(1));
      foo2 = await ethers.getContractAt('Foo', await fooFactory.addressOf(2));

      fooHandler = await (
        await ethers.getContractFactory('FooHandler')
      ).deploy(fooFactory.address);
      await fooHandler.deployed();
      await registry.register(fooHandler.address, asciiToHex32('foo'));
    });

    it('single', async function () {
      const index = 0;
      const num = BigNumber.from('25');
      const data = simpleEncode('bar(uint256,uint256)', [index, num]);
      await proxy.execMock(fooHandler.address, data);

      const result = await foo0.accounts(proxy.address);
      expect(result).to.be.eq(num);
    });

    it('should revert: caller as handler', async function () {
      const fooHandler2 = await (
        await ethers.getContractFactory('FooHandler')
      ).deploy(fooFactory.address);
      await fooHandler.deployed();

      await registry.registerCaller(fooHandler2.address, asciiToHex32('foo'));
      const index = 0;
      const num = BigNumber.from('25');
      const to = [fooHandler2.address];
      const config = [constants.HashZero];
      const data = [simpleEncode('bar(uint256,uint256)', [index, num])];

      await expect(
        proxy.connect(user).batchExec(to, config, data)
      ).to.be.revertedWith('Invalid handler');
    });

    it('should revert: handler as caller - directly', async function () {
      const foo5Handler = await (
        await ethers.getContractFactory('Foo5Handler')
      ).deploy();
      await foo5Handler.deployed();
      await registry.register(foo5Handler.address, asciiToHex32('foo5'));

      const data = simpleEncode('bar()', []);
      await expect(
        foo5Handler.connect(user).exec(proxy.address, data)
      ).to.be.revertedWith('Sender is not initialized');
    });

    it('should revert: handler as caller - after initialize', async function () {
      const foo5Handler = await (
        await ethers.getContractFactory('Foo5Handler')
      ).deploy();
      await foo5Handler.deployed();
      await registry.register(foo5Handler.address, asciiToHex32('foo5'));

      const to = foo5Handler.address;
      const data0 = simpleEncode('bar()', []);
      const data1 = simpleEncode('exec(address,bytes)', [proxy.address, data0]);
      const data2 = simpleEncode('exec(address,bytes)', [to, data1]);

      await expect(proxy.connect(user).execMock(to, data2)).to.be.revertedWith(
        'Invalid caller'
      );
    });

    it('should revert: banned agent executing batchExec()', async function () {
      await registry.ban(proxy.address);
      const index = 0;
      const num = BigNumber.from('25');
      const to = [fooHandler.address];
      const config = [constants.HashZero];
      const data = [simpleEncode('bar(uint256,uint256)', [index, num])];

      await expect(
        proxy.connect(user).batchExec(to, config, data)
      ).to.be.revertedWith('Banned');
    });

    it('should revert: banned agent executing fallback()', async function () {
      await registry.ban(proxy.address);

      await expect(
        user.sendTransaction({
          to: proxy.address,
          value: ether('1'),
          data: '0x1230',
        })
      ).to.be.revertedWith('Banned');
    });

    it('should revert: banned agent executing execs()', async function () {
      await registry.ban(proxy.address);
      const index = 0;
      const num = BigNumber.from('25');
      const to = [fooHandler.address];
      const config = [constants.HashZero];
      const data = [simpleEncode('bar(uint256,uint256)', [index, num])];

      await expect(
        proxy.connect(user).execs(to, config, data)
      ).to.be.revertedWith('Banned');
    });

    it('should revert: call batchExec() when registry halted', async function () {
      await registry.halt();
      const index = 0;
      const num = BigNumber.from('25');
      const to = [fooHandler.address];
      const config = [constants.HashZero];
      const data = [simpleEncode('bar(uint256,uint256)', [index, num])];

      await expect(
        proxy.connect(user).batchExec(to, config, data)
      ).to.be.revertedWith('Halted');
    });

    it('should revert: call fallback() when registry halted', async function () {
      await registry.halt();
      await expect(
        user.sendTransaction({
          to: proxy.address,
          value: ether('1'),
          data: '0x1230',
        })
      ).to.be.revertedWith('Halted');
    });

    it('should revert: call execs() registry halted', async function () {
      await registry.halt();
      const index = 0;
      const num = BigNumber.from('25');
      const to = [fooHandler.address];
      const config = [constants.HashZero];
      const data = [simpleEncode('bar(uint256,uint256)', [index, num])];

      await expect(
        proxy.connect(user).execs(to, config, data)
      ).to.be.revertedWith('Halted');
    });

    it('multiple', async function () {
      const index = [0, 1, 2];
      const num = [
        BigNumber.from('25'),
        BigNumber.from('26'),
        BigNumber.from('27'),
      ];
      const to = [fooHandler.address, fooHandler.address, fooHandler.address];
      const config = [
        constants.HashZero,
        constants.HashZero,
        constants.HashZero,
      ];
      const data = [
        simpleEncode('bar(uint256,uint256)', [index[0], num[0]]),
        simpleEncode('bar(uint256,uint256)', [index[1], num[1]]),
        simpleEncode('bar(uint256,uint256)', [index[2], num[2]]),
      ];
      await proxy.batchExec(to, config, data);
      const result = [
        await foo0.accounts(proxy.address),
        await foo1.accounts(proxy.address),
        await foo2.accounts(proxy.address),
      ];
      expect(result[0]).to.be.eq(num[0]);
      expect(result[1]).to.be.eq(num[1]);
      expect(result[2]).to.be.eq(num[2]);
    });
  });

  describe('execute with token', function () {
    let fooHandler: Foo2Handler;
    let foo0: Foo2;
    let foo1: Foo2;
    let foo2: Foo2;
    let fooFactory: Foo2Factory;

    beforeEach(async function () {
      fooFactory = await (
        await ethers.getContractFactory('Foo2Factory')
      ).deploy();
      await fooFactory.deployed();

      await fooFactory.createFoo();
      await fooFactory.createFoo();

      foo0 = await ethers.getContractAt('Foo2', await fooFactory.addressOf(0));
      foo1 = await ethers.getContractAt('Foo2', await fooFactory.addressOf(1));
      foo2 = await ethers.getContractAt('Foo2', await fooFactory.addressOf(2));

      fooHandler = await (
        await ethers.getContractFactory('Foo2Handler')
      ).deploy(fooFactory.address);
      await fooHandler.deployed();
      await registry.register(fooHandler.address, asciiToHex32('foo'));

      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
    });

    it('single', async function () {
      const index = 0;
      const to = fooHandler.address;
      const data = simpleEncode('bar(uint256,uint256)', [ether('1'), index]);
      await proxy.execMock(to, data, { value: ether('1') });

      expect(
        (await ethers.provider.getBalance(user.address)).sub(userBalance)
      ).to.be.eq(ether('0'));
      expect(await foo0.balanceOf(proxy.address)).to.be.eq(ether('0'));
    });

    it('multiple', async function () {
      const index = [0, 1, 2];
      const value = [ether('0.1'), ether('0.2'), ether('0.5')];
      const to = [fooHandler.address, fooHandler.address, fooHandler.address];
      const config = [
        constants.HashZero,
        constants.HashZero,
        constants.HashZero,
      ];
      const data = [
        simpleEncode('bar(uint256,uint256)', [value[0], index[0]]),
        simpleEncode('bar(uint256,uint256)', [value[1], index[1]]),
        simpleEncode('bar(uint256,uint256)', [value[2], index[2]]),
      ];

      const receipt = await proxy.connect(user).batchExec(to, config, data, {
        value: ether('1'),
      });

      expect(await balanceDelta(proxy.address, proxyBalance)).to.be.eq(
        ether('0')
      );

      expect(await balanceDelta(user.address, userBalance)).to.be.eq(
        ether('0')
          .sub(value[0].add(value[1]).add(value[2]).div(BigNumber.from('2')))
          .sub(await getGasConsumption(receipt))
      );

      expect(await foo0.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await foo0.balanceOf(user.address)).to.be.eq(
        value[0].div(BigNumber.from('2'))
      );
      expect(await foo1.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await foo1.balanceOf(user.address)).to.be.eq(
        value[1].div(BigNumber.from('2'))
      );
      expect(await foo2.balanceOf(proxy.address)).to.be.eq(ether('0'));
      expect(await foo2.balanceOf(user.address)).to.be.eq(
        value[2].div(BigNumber.from('2'))
      );
    });
  });

  describe('Direct transfer', function () {
    it('Should fail', async function () {
      await expect(
        user.sendTransaction({
          to: proxy.address,
          value: ether('1'),
        })
      ).to.be.reverted;
    });
  });

  describe('execute with customized post process', function () {
    let foo: Foo3;
    let fooHandler: Foo3Handler;

    beforeEach(async function () {
      foo = await (await ethers.getContractFactory('Foo3')).deploy();
      await foo.deployed();

      fooHandler = await (
        await ethers.getContractFactory('Foo3Handler')
      ).deploy();
      await fooHandler.deployed();
      await registry.register(fooHandler.address, asciiToHex32('foo3'));

      userBalance = await ethers.provider.getBalance(user.address);
      proxyBalance = await ethers.provider.getBalance(proxy.address);
    });

    it('post process 1', async function () {
      const to = fooHandler.address;
      const data = simpleEncode('bar1(address)', [foo.address]);
      await proxy.execMock(to, data, { value: ether('1') });
      expect(await foo.num()).to.be.eq(BigNumber.from('1'));
    });

    it('post process 2', async function () {
      const to = fooHandler.address;
      const data = simpleEncode('bar2(address)', [foo.address]);
      await proxy.execMock(to, data, { value: ether('1') });
      expect(await foo.num()).to.be.eq(BigNumber.from('2'));
    });
  });

  describe('dynamic parameter', function () {
    let foo: Foo4;
    let fooHandler: Foo4Handler;

    beforeEach(async function () {
      foo = await (await ethers.getContractFactory('Foo4')).deploy();
      await foo.deployed();

      fooHandler = await (
        await ethers.getContractFactory('Foo4Handler')
      ).deploy();
      await fooHandler.deployed();
      await registry.register(fooHandler.address, asciiToHex32('foo4'));
    });

    it('static parameter', async function () {
      const tos = [fooHandler.address];
      const a =
        '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const configs = [
        '0x0000000000000000000000000000000000000000000000000000000000000000',
      ];
      const datas = [simpleEncode('bar1(address,bytes32)', [foo.address, a])];

      await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.bValue()).eq(a);
    });

    it('replace parameter', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const r = await foo.bar();
      const a =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        // 1 32-bytes return value to be referenced
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar1(address,bytes32)', [foo.address, a]),
      ];

      await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.bValue()).eq(r);
    });

    it('replace parameter with dynamic array return', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const secAmt = ether('1');
      const ratio = ether('0.7');

      // local stack idx start from [+2] if using dynamic array
      // because it will store 2 extra data(pointer and array length) to local stack in the first and second index
      const configs = [
        // 5 32-bytes return value to be referenced
        '0x0005000000000000000000000000000000000000000000000000000000000000', // be referenced
        '0x0100000000000000000203ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] -> local stack[3]
      ];

      const datas = [
        simpleEncode('barUList(address,uint256,uint256,uint256)', [
          foo.address,
          ether('1'),
          secAmt,
          ether('1'),
        ]),
        simpleEncode('barUint1(address,uint256)', [foo.address, ratio]),
      ];

      await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.nValue()).to.be.eq(secAmt.mul(ratio).div(ether('1')));
    });

    it('replace third parameter', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const r = await foo.bar();
      const a =
        '0x000000000000000000000000000000000000000000000000000000000000000a';
      const b =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000400ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar2(address,bytes32,bytes32)', [foo.address, a, b]),
      ];

      await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.bValue()).eq(r);
    });

    it('replace parameter by 50% of ref value', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const r = await foo.callStatic.barUint();
      const a = ether('0.5');
      const configs = [
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('barUint(address)', [foo.address]),
        simpleEncode('barUint1(address,uint256)', [foo.address, a]),
      ];

      await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.nValue()).to.be.eq(r.mul(a).div(ether('1')));
    });

    it('should revert: location count less than ref count', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      // const r = await foo.bar();
      const a =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        // 1 32-bytes return value to be referenced
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x010000000000000000020000ffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (1, 2)
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar1(address,bytes32)', [foo.address, a]),
      ];

      await expect(
        proxy
          .connect(user)
          .batchExec(tos, configs, datas, { value: ether('1') })
      ).to.be.revertedWith('Location count less than ref count');
    });

    it('should revert: location count greater than ref count', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      // const r = await foo.bar();
      const a =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        // 1 32-bytes return value to be referenced
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000300ffffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (2, 1)
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar1(address,bytes32)', [foo.address, a]),
      ];

      await expect(
        proxy
          .connect(user)
          .batchExec(tos, configs, datas, { value: ether('1') })
      ).to.be.revertedWith('Location count exceeds ref count');
    });

    it('should revert: ref to out of localStack', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      // const r = await foo.bar();
      const a =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        // 1 32-bytes return value to be referenced
        '0x0001000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
        '0x0100000000000000000201ffffffffffffffffffffffffffffffffffffffffff', // ref to localStack[1]
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar1(address,bytes32)', [foo.address, a]),
      ];

      await expect(
        proxy
          .connect(user)
          .batchExec(tos, configs, datas, { value: ether('1') })
      ).to.be.revertedWith('Reference to out of localStack');
    });

    it('should revert: expected return amount not match', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      // const r = await foo.bar();
      const a =
        '0x0000000000000000000000000000000000000000000000000000000000000000';
      const configs = [
        // expect 2 32-bytes return but will only get 1
        '0x0002000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('bar(address)', [foo.address]),
        simpleEncode('bar1(address,bytes32)', [foo.address, a]),
      ];

      await expect(
        proxy
          .connect(user)
          .batchExec(tos, configs, datas, { value: ether('1') })
      ).to.be.revertedWith('Return num and parsed return num not matched');
    });

    it('should revert: overflow during trimming', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      // const r = await foo.barUint();
      const a = constants.MaxUint256; // multiply by any num greater than 0 will cause overflow
      const configs = [
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('barUint(address)', [foo.address]),
        simpleEncode('barUint1(address,uint256)', [foo.address, a]),
      ];

      await expect(
        proxy
          .connect(user)
          .batchExec(tos, configs, datas, { value: ether('1') })
      ).to.be.reverted;
    });
  });

  describe('return tokens', function () {
    let fooHandler: Foo6Handler;

    beforeEach(async function () {
      fooHandler = await (
        await ethers.getContractFactory('Foo6Handler')
      ).deploy();
      await registry.register(fooHandler.address, asciiToHex32('foo'));
    });

    it('single', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      const initialTokens = [DAI_TOKEN];
      const dealingTokens = [WETH_TOKEN];
      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      // Execution
      const returnTokens = await proxy.callStatic.batchExec(
        tos,
        configs,
        datas
      );

      // Verify
      for (let i = 0; i < returnTokens.length; i++) {
        expect(returnTokens[i]).to.be.eq(
          dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
        );
      }
    });

    it('multiple', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      const initialTokens = [MKR_TOKEN, DAI_TOKEN];
      const dealingTokens = [WETH_TOKEN, WMATIC_TOKEN];
      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      // Execution
      const returnTokens = await proxy.callStatic.batchExec(
        tos,
        configs,
        datas
      );

      // Verify
      for (let i = 0; i < returnTokens.length; i++) {
        expect(returnTokens[i]).to.be.eq(
          dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
        );
      }
    });

    it('initial token only', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      const initialTokens = [DAI_TOKEN];
      const dealingTokens: any[] = [];
      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      // Execution
      const returnTokens = await proxy.callStatic.batchExec(
        tos,
        configs,
        datas
      );

      // Verify
      for (let i = 0; i < returnTokens.length; i++) {
        expect(returnTokens[i]).to.be.eq(
          dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
        );
      }
    });

    it('dealing token only', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      // const initialTokens: any[] = [];
      const initialTokens: any[] = [];
      const dealingTokens = [DAI_TOKEN];
      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      // Execution
      const returnTokens = await proxy.callStatic.batchExec(
        tos,
        configs,
        datas
      );

      // Verify
      for (let i = 0; i < returnTokens.length; i++) {
        expect(returnTokens[i]).to.be.eq(
          dealingTokens[dealingTokens.length - (i + 1)] // returnTokens = dealingTokens.reverse()
        );
      }
    });

    it('should revert: native token cant update to initial tokens', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      const initialTokens = [NATIVE_TOKEN];
      const dealingTokens: any[] = [];

      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      await expect(
        proxy.connect(user).batchExec(tos, configs, datas)
      ).to.be.revertedWith('function call to a non-contract account');
    });

    it('should revert: native token cant update to return tokens', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const configs = [constants.HashZero, constants.HashZero];

      const initialTokens: any[] = [];
      const dealingTokens = [NATIVE_TOKEN];
      const datas = [
        simpleEncode('injects(address[])', [initialTokens]),
        simpleEncode('dealing(address[])', [dealingTokens]),
      ];

      // Execution
      await expect(
        proxy.connect(user).batchExec(tos, configs, datas)
      ).to.be.revertedWith('function call to a non-contract account');
    });
  });
});
