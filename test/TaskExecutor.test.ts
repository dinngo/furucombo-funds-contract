import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  Comptroller,
  Implementation,
  AssetRouter,
  TaskExecutor,
  IDSProxyRegistry,
  FooAction,
  Foo,
  ProxyMock,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  DAI_TOKEN,
  WBTC_TOKEN,
  WL_ANY_SIG,
} from './utils/constants';
import { getCallData, ether } from './utils/utils';

describe('Comptroller', function () {
  let comptroller: Comptroller;
  let implementation: Implementation;
  let assetRouter: AssetRouter;
  let taskExecutor: TaskExecutor;
  let dsProxyRegistry: IDSProxyRegistry;
  // let userProxy: IDSProxy;
  let proxy: ProxyMock;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let foo: Foo;
  let fooAction: FooAction;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, someone] = await (ethers as any).getSigners();
      console.log('user', user.address);
      console.log('owner', owner.address);
      console.log('someone', someone.address);

      implementation = await (
        await ethers.getContractFactory('Implementation')
      ).deploy(DS_PROXY_REGISTRY, 'PoolToken', 'PCT');
      await implementation.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy();
      await assetRouter.deployed();

      comptroller = await (
        await ethers.getContractFactory('Comptroller')
      ).deploy(implementation.address, assetRouter.address);
      await comptroller.deployed();

      const storageArray = await (
        await ethers.getContractFactory('StorageArray')
      ).deploy();
      await storageArray.deployed();

      const storageMap = await (
        await ethers.getContractFactory('StorageMap')
      ).deploy();
      await storageArray.deployed();

      taskExecutor = await (
        await ethers.getContractFactory('TaskExecutor', {
          libraries: {
            'contracts/libraries/StorageArray.sol:StorageArray':
              storageArray.address,
            'contracts/libraries/StorageMap.sol:StorageMap': storageMap.address,
          },
        })
      ).deploy(owner.address, comptroller.address);
      await taskExecutor.deployed();
      await comptroller.setExecAction(taskExecutor.address);

      foo = await (await ethers.getContractFactory('Foo')).deploy();
      await foo.deployed();

      fooAction = await (await ethers.getContractFactory('FooAction')).deploy();
      await fooAction.deployed();

      dsProxyRegistry = await ethers.getContractAt(
        'IDSProxyRegistry',
        DS_PROXY_REGISTRY
      );

      proxy = await (await ethers.getContractFactory('ProxyMock'))
        .connect(user)
        .deploy(dsProxyRegistry.address, 'ProxyMock', 'PMT');
      await proxy.deployed();

      // Permit delegate calls
      // const level = await proxy.getLevel();
      comptroller.permitDelegateCalls(
        await proxy.getLevel(),
        [fooAction.address],
        [WL_ANY_SIG]
      );
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  // TODO: test fund quota
  // TODO: test return assets
  // TODO: test delegate call validation
  // TODO: test contract call validation

  describe('execute', function () {
    describe('execute by delegate call', function () {
      it('single action', async function () {
        // Prepare action data
        const expectNValue = BigNumber.from('101');
        const actionData = getCallData(fooAction, 'barUint1', [
          foo.address,
          expectNValue,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address],
          [constants.HashZero],
          [actionData],
        ]);

        const target = taskExecutor.address;
        await proxy.connect(user).execute(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(expectNValue);
      });

      it('multiple actions', async function () {
        // Prepare action data
        const expectNValue = BigNumber.from('101');
        const actionAData = getCallData(fooAction, 'barUint1', [
          foo.address,
          expectNValue,
        ]);

        const expectBValue =
          '0x00000000000000000000000000000000000000000000000000000000000000ff';
        const actionBData = getCallData(fooAction, 'bar1', [
          foo.address,
          expectBValue,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [constants.HashZero, constants.HashZero],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).execute(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(expectNValue);
        expect(await foo.bValue()).to.be.eq(expectBValue);
      });

      it('payable action', async function () {
        // const balanceFoo = await tracker(foo.address);
        const balanceFoo = await ethers.provider.getBalance(foo.address);

        // Prepare action data
        const value = ether('1');
        const expectNValue = BigNumber.from('101');
        const actionData = getCallData(fooAction, 'barUint2', [
          foo.address,
          expectNValue,
          value,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address],
          [constants.HashZero],
          [actionData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).execute(target, data, {
          value: value,
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(expectNValue);
        expect(
          (await ethers.provider.getBalance(foo.address)).sub(balanceFoo)
        ).to.be.eq(value);
      });

      it('should revert: no contract code', async function () {
        comptroller.permitDelegateCalls(
          await proxy.getLevel(),
          [someone.address],
          [WL_ANY_SIG]
        );

        // Prepare action data
        const value = ether('1');
        const expectNValue = BigNumber.from('101');
        const actionData = getCallData(fooAction, 'barUint2', [
          foo.address,
          expectNValue,
          value,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [someone.address],
          [constants.HashZero],
          [actionData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).execute(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Address: delegate call to non-contract');
      });

      it('should revert: action revert', async function () {
        // Prepare action data
        const actionData = getCallData(fooAction, 'revertCall', []);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address],
          [constants.HashZero],
          [actionData],
        ]);
        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).execute(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('revertCall');
      });

      it('should revert: non existed function', async function () {
        comptroller.permitDelegateCalls(
          await proxy.getLevel(),
          [fooAction.address],
          [WL_ANY_SIG]
        );

        // Prepare action data
        const actionData = ethers.utils
          .keccak256(ethers.utils.toUtf8Bytes("'noExistedfunc()'"))
          .substr(0, 10);
        console.log('actionData', actionData.toString());

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address],
          [constants.HashZero],
          [actionData],
        ]);
        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).execute(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('TaskExecutor: low-level delegate call failed');
      });

      it('should revert: delegate call only', async function () {
        await expect(
          taskExecutor.batchExec([], [], [], [], [], {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Delegate call only');
      });

      it('should revert: tos and datas length are inconsistent', async function () {
        // Prepare action data
        const value = ether('1');
        const expectNValue = BigNumber.from('101');
        const actionData = getCallData(fooAction, 'barUint2', [
          foo.address,
          expectNValue,
          value,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [constants.AddressZero, constants.AddressZero],
          [constants.HashZero, constants.HashZero],
          [actionData],
        ]);
        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).execute(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('TaskExecutor: Tos and datas length inconsistent');
      });

      it('should revert: tos and configs length are inconsistent', async function () {
        // Prepare action data
        const value = ether('1');
        const expectNValue = BigNumber.from('101');
        const actionData = getCallData(fooAction, 'barUint2', [
          foo.address,
          expectNValue,
          value,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [constants.AddressZero, constants.AddressZero],
          [constants.HashZero],
          [actionData, actionData],
        ]);
        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).execute(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith(
          'TaskExecutor: Tos and configs length inconsistent'
        );
      });
    });

    // describe('execute by call', function () {
    //   it('single action', async function () {
    //     // Prepare action data
    //     const actionEthValue = ether('0');
    //     const expectNValue = BigNumber.from('111);
    //     const actionData = getCallActionData(actionEthValue, Foo, 'barUint1', [
    //       expectNValue,
    //     ]);

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await proxy.connect(user).execute(target, data, {
    //
    //       value: ether('0.01'),
    //     });

    //     // Verify
    //     expect(await foo.nValue()).to.be.eq(expectNValue);
    //   });

    //   it('multiple actions', async function () {
    //     // Prepare action data
    //     const actionAEthValue = ether('0');
    //     const expectNValue = BigNumber.from('111);
    //     const actionAData = getCallActionData(
    //       actionAEthValue,
    //       Foo,
    //       'barUint1',
    //       [expectNValue]
    //     );

    //     const actionBEthValue = ether('0');
    //     const expectBValue =
    //       '0x00000000000000000000000000000000000000000000000000000000000000ff';
    //     const actionBData = getCallActionData(actionBEthValue, Foo, 'bar1', [
    //       expectBValue,
    //     ]);

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address, foo.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionAData, actionBData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await proxy.connect(user).execute(target, data, {
    //
    //       value: ether('0.01'),
    //     });

    //     // Verify
    //     expect(await foo.nValue()).to.be.eq(expectNValue);
    //     expect(await foo.bValue()).to.be.eq(expectBValue);
    //   });

    //   it('payable action', async function () {
    //     const balanceFoo = await tracker(foo.address);

    //     // Prepare action data
    //     const actionEthValue = ether('5');
    //     const expectNValue = BigNumber.from('111);
    //     const actionData = getCallActionData(actionEthValue, Foo, 'barUint2', [
    //       expectNValue,
    //     ]);

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await proxy.connect(user).execute(target, data, {
    //
    //       value: actionEthValue,
    //     });

    //     // Verify
    //     expect(await foo.nValue()).to.be.eq(expectNValue);
    //     expect(await balanceFoo.delta()).to.be.eq(actionEthValue);
    //   });

    //   it('should revert: send token', async function () {
    //     // Prepare action data
    //     const actionEthValue = ether('5');
    //     const actionData = web3.eth.abi.encodeParameters(
    //       ['uint256', 'bytes'],
    //       [actionEthValue, '0x']
    //     );

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [someone],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await expectRevert(
    //       proxy.connect(user).execute(target, data, {
    //
    //         value: actionEthValue,
    //       }),
    //       'Address: call to non-contract'
    //     );
    //   });

    //   it('should revert: call contract revert', async function () {
    //     // Prepare action data
    //     const actionEthValue = ether('0');
    //     const actionData = getCallActionData(
    //       actionEthValue,
    //       Foo,
    //       'revertCall',
    //       []
    //     );

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await expectRevert(
    //       proxy.connect(user).execute(target, data, {
    //
    //         value: ether('0.01'),
    //       }),
    //       'revertCall'
    //     );
    //   });

    //   it('should revert: non existed function', async function () {
    //     // Prepare action data
    //     const ethValue = ether('0');
    //     const actionData = web3.eth.abi.encodeParameters(
    //       ['uint256', 'bytes'],
    //       [ethValue, web3.eth.abi.encodeFunctionSignature('noExistedfunc()')]
    //     );

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await expectRevert(
    //       proxy.connect(user).execute(target, data, {
    //
    //         value: ether('0.01'),
    //       }),
    //       'TaskExecutor: low-level call with value failed'
    //     );
    //   });
    // });

    // describe('execute by mix calls', function () {
    //   it('delegate call + call', async function () {
    //     // Prepare action data
    //     const expectNValue = BigNumber.from('101);
    //     const actionAData = getCallData(fooAction, 'barUint1', [
    //       foo.address,
    //       expectNValue,
    //     ]);

    //     const actionBEthValue = ether('0');
    //     const expectBValue =
    //       '0x00000000000000000000000000000000000000000000000000000000000000ff';
    //     const actionBData = getCallActionData(actionBEthValue, Foo, 'bar1', [
    //       expectBValue,
    //     ]);

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [fooAction.address, foo.address],
    //       [
    //         constants.HashZero,
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //       ],
    //       [actionAData, actionBData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await proxy.connect(user).execute(target, data, {
    //
    //       value: ether('0.01'),
    //     });

    //     // Verify
    //     expect(await foo.nValue()).to.be.eq(expectNValue);
    //     expect(await foo.bValue()).to.be.eq(expectBValue);
    //   });

    //   it('call + delegate call', async function () {
    //     // Prepare action data
    //     const actionAEthValue = ether('0');
    //     const expectBValue =
    //       '0x00000000000000000000000000000000000000000000000000000000000000ff';
    //     const actionAData = getCallActionData(actionAEthValue, Foo, 'bar1', [
    //       expectBValue,
    //     ]);

    //     const expectNValue = BigNumber.from('101);
    //     const actionBData = getCallData(fooAction, 'barUint1', [
    //       foo.address,
    //       expectNValue,
    //     ]);

    //     // Prepare task data and execute
    //     const data = getCallData(taskExecutor, 'batchExec', [
    //       [foo.address, fooAction.address],
    //       [
    //         '0x0200000000000000000000000000000000000000000000000000000000000000',
    //         constants.HashZero,
    //       ],
    //       [actionAData, actionBData],
    //     ]);
    //     const target = taskExecutor.address;
    //     await proxy.connect(user).execute(target, data, {
    //
    //       value: ether('0.01'),
    //     });

    //     // Verify
    //     expect(await foo.nValue()).to.be.eq(expectNValue);
    //     expect(await foo.bValue()).to.be.eq(expectBValue);
    //   });
    // });
  });
});
