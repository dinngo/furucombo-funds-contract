import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  FurucomboRegistry,
  FooFactory,
  Foo,
  Foo4,
  FooHandler,
  Foo4Handler,
} from '../../typechain';

import {
  ether,
  simpleEncode,
  asciiToHex32,
  getFuncSig,
} from './../utils/utils';

describe('ProxyLog', function () {
  let owner: Wallet;
  let user: Wallet;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup proxy and Aproxy
      registry = await (
        await ethers.getContractFactory('FurucomboRegistry')
      ).deploy();
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

    it('multiple', async function () {
      const indices = [0, 1, 2];

      const nums = [
        BigNumber.from('25'),
        BigNumber.from('26'),
        BigNumber.from('27'),
      ];
      const tos = [fooHandler.address, fooHandler.address, fooHandler.address];
      const configs = [
        constants.HashZero,
        constants.HashZero,
        constants.HashZero,
      ];
      const datas = [
        simpleEncode('bar(uint256,uint256)', [indices[0], nums[0]]),
        simpleEncode('bar(uint256,uint256)', [indices[1], nums[1]]),
        simpleEncode('bar(uint256,uint256)', [indices[2], nums[2]]),
      ];

      const selector = getFuncSig(fooHandler, 'bar');
      const receipt = await proxy.batchExec(tos, configs, datas);
      const result = [
        await foo0.accounts(proxy.address),
        await foo1.accounts(proxy.address),
        await foo2.accounts(proxy.address),
      ];
      expect(result[0]).to.be.eq(nums[0]);
      expect(result[1]).to.be.eq(nums[1]);
      expect(result[2]).to.be.eq(nums[2]);

      // check events
      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selector, datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selector, result[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selector, datas[1]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selector, result[1]);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selector, datas[2]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selector, result[2]);
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
      const selector = getFuncSig(fooHandler, 'bar1');

      const receipt = await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      expect(await foo.bValue()).eq(a);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selector, datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selector, a);
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
      const selectors = [
        getFuncSig(fooHandler, 'bar'),
        getFuncSig(fooHandler, 'bar1'),
      ];

      const receipt = await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });
      // Pad the data by replacing the parameter part with r, which is the execution result of the first handler
      const paddedData = datas[1].slice(0, 74) + r.slice(2);

      expect(await foo.bValue()).eq(r);
      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[0], datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[0], r);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[1], paddedData);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[1], r);
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
      const selectors = [
        getFuncSig(fooHandler, 'barUList'),
        getFuncSig(fooHandler, 'barUint1'),
      ];

      const r = ethers.utils.defaultAbiCoder.encode(
        ['uint256[]'],
        [[ether('1').toString(), secAmt.toString(), ether('1').toString()]]
      );

      const n = secAmt.mul(ratio).div(ether('1'));

      const receipt = await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      // Pad the data by replacing the parameter part with 0.7 * the execution result of first handler
      // 0x:2, functionSig: 8, first parameter: 64
      const paddedData =
        datas[1].slice(0, 2 + 8 + 64) +
        ethers.utils.hexZeroPad(n.toHexString(), 32).slice(2);

      expect(await foo.nValue()).to.be.eq(n);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[0], datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[0], r);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[1], paddedData);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[1], n);
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
      const selectors = [
        getFuncSig(fooHandler, 'bar'),
        getFuncSig(fooHandler, 'bar2'),
      ];

      const receipt = await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });

      // Pad the data by replacing the third parameter part with the execution result of first handler
      // 0x:2, functionSig: 8, parameter: 64
      const paddedData = datas[1].slice(0, 2 + 8 + 64 + 64) + r.slice(2);

      expect(await foo.bValue()).eq(r);
      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[0], datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[0], r);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[1], paddedData);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(fooHandler.address, selectors[1], r);
    });

    it('replace parameter by 50% of ref value', async function () {
      const tos = [fooHandler.address, fooHandler.address];
      const r = await foo.callStatic.barUint();
      const a = ether('0.5');
      const n = r.mul(a).div(ether('1'));
      const configs = [
        '0x0001000000000000000000000000000000000000000000000000000000000000',
        '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff',
      ];
      const datas = [
        simpleEncode('barUint(address)', [foo.address]),
        simpleEncode('barUint1(address,uint256)', [foo.address, a]),
      ];
      const selectors = [
        getFuncSig(fooHandler, 'barUint'),
        getFuncSig(fooHandler, 'barUint1'),
      ];

      const receipt = await proxy.connect(user).batchExec(tos, configs, datas, {
        value: ether('1'),
      });
      // Pad the data by replacing the parameter part with 0.5 * the execution result of first handler
      const paddedData =
        datas[1].slice(0, 2 + 8 + 64) +
        ethers.utils.hexZeroPad(n.toHexString(), 32).slice(2);

      expect(await foo.nValue()).to.be.eq(n);

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[0], datas[0]);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(
          fooHandler.address,
          selectors[0],
          ethers.utils.hexZeroPad(ether('1').toHexString(), 32)
        );

      await expect(receipt)
        .to.emit(proxy, 'LogBegin')
        .withArgs(fooHandler.address, selectors[1], paddedData);

      await expect(receipt)
        .to.emit(proxy, 'LogEnd')
        .withArgs(
          fooHandler.address,
          selectors[1],
          ethers.utils.hexZeroPad(n.toHexString(), 32)
        );
    });
  });
});
