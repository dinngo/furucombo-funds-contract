import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  PoolImplementation,
  AssetRouter,
  MortgageVault,
  TaskExecutor,
  IDSProxyRegistry,
  PoolFooAction,
  PoolFoo,
  PoolProxyMock,
  IERC20,
  AssetRegistry,
  Chainlink,
  SimpleToken,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  DAI_TOKEN,
  DAI_PROVIDER,
  WETH_TOKEN,
  WETH_PROVIDER,
  WL_ANY_SIG,
  NATIVE_TOKEN,
  FEE_BASE,
} from './utils/constants';
import {
  getCallData,
  getCallActionData,
  ether,
  impersonateAndInjectEther,
} from './utils/utils';

describe('Task Executor', function () {
  let comptroller: ComptrollerImplementation;
  let poolImplementation: PoolImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let taskExecutor: TaskExecutor;
  let dsProxyRegistry: IDSProxyRegistry;
  let proxy: PoolProxyMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;

  let foo: PoolFoo;
  let fooAction: PoolFooAction;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let tokenAProvider: Signer;
  let tokenBProvider: Signer;

  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenD: SimpleToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [owner, user, collector] = await (ethers as any).getSigners();

      // setup token and unlock provider
      tokenAProvider = await impersonateAndInjectEther(DAI_PROVIDER);
      tokenBProvider = await impersonateAndInjectEther(WETH_PROVIDER);
      tokenA = await ethers.getContractAt('IERC20', DAI_TOKEN);
      tokenB = await ethers.getContractAt('IERC20', WETH_TOKEN);

      poolImplementation = await (
        await ethers.getContractFactory('PoolImplementation')
      ).deploy(DS_PROXY_REGISTRY);
      await poolImplementation.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await assetRouter.deployed();

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(tokenA.address);
      await mortgageVault.deployed();

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).deploy();
      await comptroller.deployed();
      await comptroller.initialize(
        poolImplementation.address,
        assetRouter.address,
        collector.address,
        0,
        constants.AddressZero,
        constants.Zero,
        mortgageVault.address,
        0
      );

      taskExecutor = await (
        await ethers.getContractFactory('TaskExecutor')
      ).deploy(owner.address, comptroller.address);
      await taskExecutor.deployed();
      await comptroller.setExecAction(taskExecutor.address);

      foo = await (await ethers.getContractFactory('PoolFoo')).deploy();
      await foo.deployed();

      fooAction = await (
        await ethers.getContractFactory('PoolFooAction')
      ).deploy();
      await fooAction.deployed();

      dsProxyRegistry = await ethers.getContractAt(
        'IDSProxyRegistry',
        DS_PROXY_REGISTRY
      );

      proxy = await (await ethers.getContractFactory('PoolProxyMock'))
        .connect(user)
        .deploy(dsProxyRegistry.address);
      await proxy.deployed();

      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();
      // initialize
      await proxy.setComptroller(comptroller.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await proxy.setupDenomination(tokenD.address);
      await proxy.setLevel(1);
      await proxy.setVault();

      // Permit delegate calls
      comptroller.permitDelegateCalls(
        await proxy.level(),
        [fooAction.address],
        [WL_ANY_SIG]
      );

      comptroller.permitContractCalls(
        await proxy.level(),
        [foo.address],
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
      await proxy.connect(user).executeMock(target, data, {
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
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await foo.bValue()).to.be.eq(expectBValue);
    });

    it('payable action', async function () {
      const balancePoolFoo = await ethers.provider.getBalance(foo.address);

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
      await proxy.connect(user).executeMock(target, data, {
        value: value,
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(
        (await ethers.provider.getBalance(foo.address)).sub(balancePoolFoo)
      ).to.be.eq(value);
    });

    it('should revert: no contract code', async function () {
      comptroller.permitDelegateCalls(
        await proxy.level(),
        [collector.address],
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
        [collector.address],
        [constants.HashZero],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCall');
    });

    it('should revert: non existed function', async function () {
      comptroller.permitDelegateCalls(
        await proxy.level(),
        [fooAction.address],
        [WL_ANY_SIG]
      );

      // Prepare action data
      const actionData = ethers.utils
        .keccak256(ethers.utils.toUtf8Bytes("'noExistedfunc()'"))
        .substr(0, 10);

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
        proxy.connect(user).executeMock(target, data, {
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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(29'); // TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT
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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(30)'); // TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT
    });

    it('should revert: invalid comptroller delegate call', async function () {
      await comptroller.canDelegateCall(
        await proxy.level(),
        collector.address,
        WL_ANY_SIG
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
        [collector.address],
        [constants.HashZero],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(31)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
    });

    it('should revert: invalid proxy delegate call', async function () {
      // Prepare task data and execute
      const actionData = '0x11111111';
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [NATIVE_TOKEN],
        [constants.HashZero],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(31'); // TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
    });
  });

  describe('execute by call', function () {
    it('single action', async function () {
      // Prepare action data
      const actionEthValue = ether('0');
      const expectNValue = BigNumber.from('111');
      const actionData = getCallActionData(actionEthValue, foo, 'barUint1', [
        expectNValue,
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
    });

    it('multiple actions', async function () {
      // Prepare action data
      const actionAEthValue = ether('0');
      const expectNValue = BigNumber.from('111');
      const actionAData = getCallActionData(actionAEthValue, foo, 'barUint1', [
        expectNValue,
      ]);

      const actionBEthValue = ether('0');
      const expectBValue =
        '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [
        expectBValue,
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address, foo.address],
        [
          '0x0200000000000000000000000000000000000000000000000000000000000000',
          '0x0200000000000000000000000000000000000000000000000000000000000000',
        ],
        [actionAData, actionBData],
      ]);
      const target = taskExecutor.address;
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await foo.bValue()).to.be.eq(expectBValue);
    });

    it('payable action', async function () {
      const balancePoolFoo = await ethers.provider.getBalance(foo.address);

      // Prepare action data
      const actionEthValue = ether('5');
      const expectNValue = BigNumber.from('111');
      const actionData = getCallActionData(actionEthValue, foo, 'barUint2', [
        expectNValue,
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;
      await proxy.connect(user).executeMock(target, data, {
        value: actionEthValue,
      });

      // Verify
      const balancePoolFooEnd = await ethers.provider.getBalance(foo.address);
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await balancePoolFooEnd.sub(balancePoolFoo)).to.be.eq(
        actionEthValue
      );
    });

    it('should revert: send token', async function () {
      await comptroller.permitContractCalls(
        await proxy.level(),
        [collector.address],
        [WL_ANY_SIG]
      );

      // Prepare action data
      const actionEthValue = ether('5');
      const actionData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [actionEthValue, '0x']
      );

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [collector.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: actionEthValue,
        })
      ).to.be.revertedWith('Address: call to non-contract');
    });

    it('should revert: call contract revert', async function () {
      // Prepare action data
      const actionEthValue = ether('0');
      const actionData = getCallActionData(
        actionEthValue,
        foo,
        'revertCall',
        []
      );

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;
      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCall');
    });

    it('should revert: non existed function', async function () {
      // Prepare action data
      const ethValue = ether('0');

      const actionData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [
          ethValue,
          ethers.utils
            .keccak256(ethers.utils.toUtf8Bytes("'noExistedfunc()'"))
            .substr(0, 10),
        ]
      );

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;
      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('TaskExecutor: low-level call with value failed');
    });

    it('should revert: invalid comptroller contract call', async function () {
      // Prepare action data
      const actionEthValue = ether('5');

      const actionData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [actionEthValue, '0x']
      );

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [collector.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: actionEthValue,
        })
      ).to.be.revertedWith('revertCode(32)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL
    });

    it('should revert: invalid proxy contract call', async function () {
      // Prepare action data
      const actionEthValue = ether('5');
      const actionData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [actionEthValue, '0x11111111']
      );

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [NATIVE_TOKEN],
        ['0x0200000000000000000000000000000000000000000000000000000000000000'],
        [actionData],
      ]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: actionEthValue,
        })
      ).to.be.revertedWith('revertCode(32)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL
    });
  });

  describe('execute by mix calls', function () {
    it('delegate call + call', async function () {
      // Prepare action data
      const expectNValue = BigNumber.from('101');
      const actionAData = getCallData(fooAction, 'barUint1', [
        foo.address,
        expectNValue,
      ]);

      const actionBEthValue = ether('0');
      const expectBValue =
        '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [
        expectBValue,
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, foo.address],
        [
          constants.HashZero,
          '0x0200000000000000000000000000000000000000000000000000000000000000',
        ],
        [actionAData, actionBData],
      ]);
      const target = taskExecutor.address;
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await foo.bValue()).to.be.eq(expectBValue);
    });

    it('call + delegate call', async function () {
      // Prepare action data
      const actionAEthValue = ether('0');
      const expectBValue =
        '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionAData = getCallActionData(actionAEthValue, foo, 'bar1', [
        expectBValue,
      ]);

      const expectNValue = BigNumber.from('101');
      const actionBData = getCallData(fooAction, 'barUint1', [
        foo.address,
        expectNValue,
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address, fooAction.address],
        [
          '0x0200000000000000000000000000000000000000000000000000000000000000',
          constants.HashZero,
        ],
        [actionAData, actionBData],
      ]);
      const target = taskExecutor.address;
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // Verify
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await foo.bValue()).to.be.eq(expectBValue);
    });
  });

  describe('return assets', function () {
    beforeEach(async function () {
      await comptroller.permitAssets(await proxy.level(), [tokenA.address]);
      expect(
        await comptroller.isValidDealingAsset(
          await proxy.level(),
          tokenA.address
        )
      ).to.be.eq(true);
    });

    it('single asset', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address];
      await comptroller.permitAssets(
        await proxy.level(),
        expectedDealingAssets
      );

      const actionData = getCallData(fooAction, 'addAssets', [
        expectedDealingAssets,
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
      const returnData = await proxy
        .connect(user)
        .callStatic.executeMock(target, data, {
          value: ether('0.01'),
        });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(
        ['address[]'],
        returnData
      )[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('multiple assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(
        await proxy.level(),
        expectedDealingAssets
      );

      const actionData = getCallData(fooAction, 'addAssets', [
        expectedDealingAssets,
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
      const returnData = await proxy
        .connect(user)
        .callStatic.executeMock(target, data, {
          value: ether('0.01'),
        });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(
        ['address[]'],
        returnData
      )[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('multiple actions', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(
        await proxy.level(),
        expectedDealingAssets
      );

      const actionData1 = getCallData(fooAction, 'addAssets', [
        [tokenA.address],
      ]);
      const actionData2 = getCallData(fooAction, 'addAssets', [
        [tokenB.address],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, fooAction.address],
        [constants.HashZero, constants.HashZero],
        [actionData1, actionData2],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy
        .connect(user)
        .callStatic.executeMock(target, data, {
          value: ether('0.01'),
        });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(
        ['address[]'],
        returnData
      )[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('repeat assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(
        await proxy.level(),
        expectedDealingAssets
      );

      const actionData1 = getCallData(fooAction, 'addAssets', [
        [tokenA.address],
      ]);
      const actionData2 = getCallData(fooAction, 'addAssets', [
        [tokenA.address, tokenB.address],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, fooAction.address],
        [constants.HashZero, constants.HashZero],
        [actionData1, actionData2],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy
        .connect(user)
        .callStatic.executeMock(target, data, {
          value: ether('0.01'),
        });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(
        ['address[]'],
        returnData
      )[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('should revert: invalid assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address];
      await comptroller.permitAssets(
        await proxy.level(),
        expectedDealingAssets
      );

      const actionData = getCallData(fooAction, 'addAssets', [
        [tokenB.address],
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
      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(33)'); // TASK_EXECUTOR_INVALID_DEALING_ASSET
    });
  });

  describe('fund quota', function () {
    const quota = ether('10');

    beforeEach(async function () {
      await comptroller.permitAssets(await proxy.level(), [tokenA.address]);
      await tokenA.connect(tokenAProvider).transfer(await proxy.vault(), quota);
      await tokenB.connect(tokenBProvider).transfer(await proxy.vault(), quota);
    });

    it('charge execution fee', async function () {
      // setup  env before execution
      await comptroller.setInitialAssetCheck(false);
      const collector = await comptroller.execFeeCollector();
      const feePercentage = await comptroller.execFeePercentage();
      const expectExecutionFee = quota.mul(feePercentage).div(FEE_BASE);
      const consumeQuota = quota.sub(expectExecutionFee);
      const collectorTokenABalance = await tokenA.balanceOf(collector);
      const collectorTokenBBalance = await tokenB.balanceOf(collector);

      // Prepare action data
      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [tokenA.address, tokenB.address],
        [consumeQuota, consumeQuota.sub(BigNumber.from('100'))],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [tokenA.address, tokenB.address],
        [quota, quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      // Execution
      const target = taskExecutor.address;
      await proxy.connect(user).callStatic.executeMock(target, data, {
        value: quota,
      });

      // Verify
      expect(
        (await tokenA.balanceOf(collector)).sub(collectorTokenABalance)
      ).to.be.eq(expectExecutionFee);
      expect(
        (await tokenB.balanceOf(collector)).sub(collectorTokenBBalance)
      ).to.be.eq(expectExecutionFee);
    });

    it('execution twice for checking fund quota will be reset', async function () {
      await comptroller.setInitialAssetCheck(false);
      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [tokenA.address],
        [BigNumber.from('1')],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [tokenA.address],
        [quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      // 1st execution
      await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });

      // 2nd execution
      await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });
    });

    it('should revert: invalid asset', async function () {
      const consumeQuota = quota.div(BigNumber.from('2'));
      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [tokenB.address],
        [consumeQuota],
      ]);

      expect(
        await comptroller.isValidInitialAsset(
          await proxy.level(),
          tokenB.address
        )
      ).to.be.eq(false);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [tokenB.address],
        [quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      await expect(
        proxy.connect(user).callStatic.executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(38)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET
    });

    it('should revert: native token', async function () {
      const consumeQuota = quota.div(BigNumber.from('2'));
      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [NATIVE_TOKEN],
        [consumeQuota],
      ]);

      expect(
        await comptroller.isValidInitialAsset(await proxy.level(), NATIVE_TOKEN)
      ).to.be.eq(false);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [NATIVE_TOKEN],
        [quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      await expect(
        proxy.connect(user).callStatic.executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(38)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET
    });

    it('should revert: insufficient quota', async function () {
      const consumeQuota = quota.add(BigNumber.from('10'));

      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [tokenA.address],
        [consumeQuota],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [tokenA.address],
        [quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).callStatic.executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('FundQuotaAction: insufficient quota');
    });

    it('should revert: repeat assets', async function () {
      const consumeQuota = quota.div(BigNumber.from('2'));
      const actionData = getCallData(fooAction, 'decreaseQuota', [
        [tokenA.address, tokenA.address],
        [consumeQuota, consumeQuota],
      ]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [tokenA.address, tokenA.address],
        [quota, quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      await expect(
        proxy.connect(user).callStatic.executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('revertCode(39)'); // TASK_EXECUTOR_NON_ZERO_QUOTA
    });
  });
});
