import { constants, Wallet, BigNumber, Signer, BytesLike } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  FundImplementation,
  AssetRouter,
  MortgageVault,
  TaskExecutor,
  IDSProxyRegistry,
  FundFooAction,
  FundFoo,
  FundProxyMock,
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
  FUND_PERCENTAGE_BASE,
} from './utils/constants';
import {
  getCallData,
  getCallActionData,
  ether,
  impersonateAndInjectEther,
  getTaskExecutorAssetQuotas,
} from './utils/utils';

describe('Task Executor', function () {
  let comptroller: ComptrollerImplementation;
  let fundImplementation: FundImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let taskExecutor: TaskExecutor;
  let dsProxyRegistry: IDSProxyRegistry;
  let proxy: FundProxyMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;
  let liquidator: Wallet;

  let foo: FundFoo;
  let fooAction: FundFooAction;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let tokenAProvider: Signer;
  let tokenBProvider: Signer;

  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenD: SimpleToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, collector, liquidator] = await (ethers as any).getSigners();

    // setup token and unlock provider
    tokenAProvider = await impersonateAndInjectEther(DAI_PROVIDER);
    tokenBProvider = await impersonateAndInjectEther(WETH_PROVIDER);
    tokenA = await ethers.getContractAt('IERC20', DAI_TOKEN);
    tokenB = await ethers.getContractAt('IERC20', WETH_TOKEN);

    fundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
    await fundImplementation.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();

    assetRouter = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await assetRouter.deployed();

    mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(tokenA.address);
    await mortgageVault.deployed();

    const setupAction = await (await ethers.getContractFactory('SetupAction')).deploy();
    await setupAction.deployed();

    comptroller = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
    await comptroller.deployed();
    await comptroller.initialize(
      fundImplementation.address,
      assetRouter.address,
      collector.address,
      0,
      liquidator.address,
      constants.Zero,
      mortgageVault.address,
      0,
      DS_PROXY_REGISTRY,
      setupAction.address
    );

    taskExecutor = await (await ethers.getContractFactory('TaskExecutor')).deploy(owner.address, comptroller.address);
    await taskExecutor.deployed();
    await comptroller.setExecAction(taskExecutor.address);
    await comptroller.setExecFeePercentage(100); // set execution fee 1%

    foo = await (await ethers.getContractFactory('FundFoo')).deploy();
    await foo.deployed();

    fooAction = await (await ethers.getContractFactory('FundFooAction')).deploy();
    await fooAction.deployed();

    dsProxyRegistry = await ethers.getContractAt('IDSProxyRegistry', DS_PROXY_REGISTRY);

    proxy = await (await ethers.getContractFactory('FundProxyMock')).connect(user).deploy();
    await proxy.deployed();
    // await proxy.setVault(dsProxyRegistry.address);

    tokenD = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await tokenD.deployed();
    // initialize
    await proxy.setComptroller(comptroller.address);
    await comptroller.permitDenominations([tokenD.address], [0]);
    await proxy.setDenomination(tokenD.address);
    await proxy.setLevel(1);
    await proxy.setVault(DS_PROXY_REGISTRY);

    // Permit delegate calls
    await comptroller.permitDelegateCalls(await proxy.level(), [fooAction.address], [WL_ANY_SIG]);

    await comptroller.permitContractCalls(await proxy.level(), [foo.address], [WL_ANY_SIG]);
  });

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
      const actionData = getCallData(fooAction, 'barUint1', [foo.address, expectNValue]);

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
      const actionAData = getCallData(fooAction, 'barUint1', [foo.address, expectNValue]);

      const expectBValue = '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionBData = getCallData(fooAction, 'bar1', [foo.address, expectBValue]);

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
      const balanceFundFoo = await ethers.provider.getBalance(foo.address);

      // Prepare action data
      const value = ether('1');
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint2', [foo.address, expectNValue, value]);

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
      expect((await ethers.provider.getBalance(foo.address)).sub(balanceFundFoo)).to.be.eq(value);
    });

    it('should revert: no contract code', async function () {
      await comptroller.permitDelegateCalls(await proxy.level(), [collector.address], [WL_ANY_SIG]);

      // Prepare action data
      const value = ether('1');
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint2', [foo.address, expectNValue, value]);

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
      await comptroller.permitDelegateCalls(await proxy.level(), [fooAction.address], [WL_ANY_SIG]);

      // Prepare action data
      const actionData = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("'noExistedfunc()'")).substr(0, 10);

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
      const actionData = getCallData(fooAction, 'barUint2', [foo.address, expectNValue, value]);

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
      ).to.be.revertedWith('RevertCode(25'); // TASK_EXECUTOR_TOS_AND_DATAS_LENGTH_INCONSISTENT
    });

    it('should revert: tos and configs length are inconsistent', async function () {
      // Prepare action data
      const value = ether('1');
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint2', [foo.address, expectNValue, value]);

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
      ).to.be.revertedWith('RevertCode(26)'); // TASK_EXECUTOR_TOS_AND_CONFIGS_LENGTH_INCONSISTENT
    });

    it('should revert: invalid comptroller delegate call', async function () {
      await comptroller.canDelegateCall(await proxy.level(), collector.address, WL_ANY_SIG);

      // Prepare action data
      const value = ether('1');
      const expectNValue = BigNumber.from('101');
      const actionData = getCallData(fooAction, 'barUint2', [foo.address, expectNValue, value]);

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
      ).to.be.revertedWith('RevertCode(27)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
    });

    it('should revert: invalid proxy delegate call', async function () {
      // Prepare task data and execute
      const actionData = '0x11111111';
      const data = getCallData(taskExecutor, 'batchExec', [[], [], [NATIVE_TOKEN], [constants.HashZero], [actionData]]);
      const target = taskExecutor.address;

      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('RevertCode(27'); // TASK_EXECUTOR_INVALID_COMPTROLLER_DELEGATE_CALL
    });
  });

  describe('execute by call', function () {
    it('single action', async function () {
      // Prepare action data
      const actionEthValue = ether('0');
      const expectNValue = BigNumber.from('111');
      const actionData = getCallActionData(actionEthValue, foo, 'barUint1', [expectNValue]);

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
      const actionAData = getCallActionData(actionAEthValue, foo, 'barUint1', [expectNValue]);

      const actionBEthValue = ether('0');
      const expectBValue = '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [expectBValue]);

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
      const balanceFundFoo = await ethers.provider.getBalance(foo.address);

      // Prepare action data
      const actionEthValue = ether('5');
      const expectNValue = BigNumber.from('111');
      const actionData = getCallActionData(actionEthValue, foo, 'barUint2', [expectNValue]);

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
      const balanceFundFooEnd = await ethers.provider.getBalance(foo.address);
      expect(await foo.nValue()).to.be.eq(expectNValue);
      expect(await balanceFundFooEnd.sub(balanceFundFoo)).to.be.eq(actionEthValue);
    });

    it('should revert: send token', async function () {
      await comptroller.permitContractCalls(await proxy.level(), [collector.address], [WL_ANY_SIG]);

      // Prepare action data
      const actionEthValue = ether('5');
      const actionData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [actionEthValue, '0x']);

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
      const actionData = getCallActionData(actionEthValue, foo, 'revertCall', []);

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
        [ethValue, ethers.utils.keccak256(ethers.utils.toUtf8Bytes("'noExistedfunc()'")).substr(0, 10)]
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

      const actionData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [actionEthValue, '0x']);

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
      ).to.be.revertedWith('RevertCode(28)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL
    });

    it('should revert: invalid proxy contract call', async function () {
      // Prepare action data
      const actionEthValue = ether('5');
      const actionData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [actionEthValue, '0x11111111']);

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
      ).to.be.revertedWith('RevertCode(28)'); // TASK_EXECUTOR_INVALID_COMPTROLLER_CONTRACT_CALL
    });
  });

  describe('execute by mix calls', function () {
    it('delegate call + call', async function () {
      // Prepare action data
      const expectNValue = BigNumber.from('101');
      const actionAData = getCallData(fooAction, 'barUint1', [foo.address, expectNValue]);

      const actionBEthValue = ether('0');
      const expectBValue = '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [expectBValue]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, foo.address],
        [constants.HashZero, '0x0200000000000000000000000000000000000000000000000000000000000000'],
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
      const expectBValue = '0x00000000000000000000000000000000000000000000000000000000000000ff';
      const actionAData = getCallActionData(actionAEthValue, foo, 'bar1', [expectBValue]);

      const expectNValue = BigNumber.from('101');
      const actionBData = getCallData(fooAction, 'barUint1', [foo.address, expectNValue]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [foo.address, fooAction.address],
        ['0x0200000000000000000000000000000000000000000000000000000000000000', constants.HashZero],
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
      expect(await comptroller.isValidDealingAsset(await proxy.level(), tokenA.address)).to.be.eq(true);
    });

    it('single asset', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address];
      await comptroller.permitAssets(await proxy.level(), expectedDealingAssets);

      const actionData = getCallData(fooAction, 'addAssets', [expectedDealingAssets]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(['address[]'], returnData)[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('multiple assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(await proxy.level(), expectedDealingAssets);

      const actionData = getCallData(fooAction, 'addAssets', [expectedDealingAssets]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(['address[]'], returnData)[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('multiple actions', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(await proxy.level(), expectedDealingAssets);

      const actionData1 = getCallData(fooAction, 'addAssets', [[tokenA.address]]);
      const actionData2 = getCallData(fooAction, 'addAssets', [[tokenB.address]]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, fooAction.address],
        [constants.HashZero, constants.HashZero],
        [actionData1, actionData2],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(['address[]'], returnData)[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('repeat assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address, tokenB.address];
      await comptroller.permitAssets(await proxy.level(), expectedDealingAssets);

      const actionData1 = getCallData(fooAction, 'addAssets', [[tokenA.address]]);
      const actionData2 = getCallData(fooAction, 'addAssets', [[tokenA.address, tokenB.address]]);

      // Prepare task data and execute
      const data = getCallData(taskExecutor, 'batchExec', [
        [],
        [],
        [fooAction.address, fooAction.address],
        [constants.HashZero, constants.HashZero],
        [actionData1, actionData2],
      ]);

      const target = taskExecutor.address;
      const returnData = await proxy.connect(user).callStatic.executeMock(target, data, {
        value: ether('0.01'),
      });

      const dealingAssets = ethers.utils.defaultAbiCoder.decode(['address[]'], returnData)[0];

      // Verify
      expect(dealingAssets.length).to.be.eq(expectedDealingAssets.length);
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(dealingAssets[i]).to.be.eq(expectedDealingAssets[i]);
      }
    });

    it('should revert: invalid assets', async function () {
      // Prepare action data
      const expectedDealingAssets = [tokenA.address];
      await comptroller.permitAssets(await proxy.level(), expectedDealingAssets);

      const actionData = getCallData(fooAction, 'addAssets', [[tokenB.address]]);

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
      ).to.be.revertedWith('RevertCode(29)'); // TASK_EXECUTOR_INVALID_DEALING_ASSET
    });
  });

  describe('asset quota', function () {
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
      const expectExecutionFee = quota.mul(feePercentage).div(FUND_PERCENTAGE_BASE);
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
      const vaultAddress = await proxy.vault();
      const vault = await ethers.getContractAt('TaskExecutor', vaultAddress);
      await expect(
        proxy.connect(user).executeMock(target, data, {
          value: quota,
        })
      )
        .to.emit(vault, 'ExecFee')
        .withArgs(proxy.address, tokenA.address, expectExecutionFee)
        .to.emit(vault, 'ExecFee')
        .withArgs(proxy.address, tokenB.address, expectExecutionFee);

      // Verify
      expect((await tokenA.balanceOf(collector)).sub(collectorTokenABalance)).to.be.eq(expectExecutionFee);
      expect((await tokenB.balanceOf(collector)).sub(collectorTokenBBalance)).to.be.eq(expectExecutionFee);
    });

    it('execution twice for checking asset quota will be reset', async function () {
      // Replace TaskExecutor with TaskExecutorMock for checking asset quota
      const taskExecutorMock = await (
        await ethers.getContractFactory('TaskExecutorMock')
      ).deploy(owner.address, comptroller.address);
      await taskExecutorMock.deployed();

      await comptroller.setInitialAssetCheck(false);
      const actionData = getCallData(fooAction, 'decreaseQuota', [[tokenA.address], [BigNumber.from('1')]]);

      // Prepare task data and execute
      const tokensIn = [tokenA.address];
      const data = getCallData(taskExecutorMock, 'batchExec', [
        tokensIn,
        [quota],
        [fooAction.address],
        [constants.HashZero],
        [actionData],
      ]);

      const target = taskExecutorMock.address;
      // 1st execution
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // if success when executing 2nd time, that means the asset quota reset to zero after 1st execution
      await proxy.connect(user).executeMock(target, data, {
        value: ether('0.01'),
      });

      // check asset quota reset to zero
      const assetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutorMock, tokensIn);
      for (let i = 0; i < assetQuotas.length; i++) {
        expect(assetQuotas[0]).to.be.eq(0);
      }
    });

    it('should revert: invalid asset', async function () {
      const consumeQuota = quota.div(BigNumber.from('2'));
      const actionData = getCallData(fooAction, 'decreaseQuota', [[tokenB.address], [consumeQuota]]);

      expect(await comptroller.isValidInitialAsset(await proxy.level(), tokenB.address)).to.be.eq(false);

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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('RevertCode(34)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET
    });

    it('should revert: native token', async function () {
      const consumeQuota = quota.div(BigNumber.from('2'));
      const actionData = getCallData(fooAction, 'decreaseQuota', [[NATIVE_TOKEN], [consumeQuota]]);

      expect(await comptroller.isValidInitialAsset(await proxy.level(), NATIVE_TOKEN)).to.be.eq(false);

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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('RevertCode(34)'); // TASK_EXECUTOR_INVALID_INITIAL_ASSET
    });

    it('should revert: insufficient quota', async function () {
      const consumeQuota = quota.add(BigNumber.from('10'));

      const actionData = getCallData(fooAction, 'decreaseQuota', [[tokenA.address], [consumeQuota]]);

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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith(
        'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
      );
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
        proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        })
      ).to.be.revertedWith('RevertCode(35)'); // TASK_EXECUTOR_NON_ZERO_QUOTA
    });
  });

  describe('chained input', function () {
    describe('dynamic parameter by delegate call', function () {
      it('replace parameter', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter with dynamic array return', async function () {
        // Prepare action data
        const secAmt = ether('1');
        const actionAData = getCallData(fooAction, 'barUList', [foo.address, ether('1'), secAmt, ether('1')]);

        const ratio = ether('0.7');
        const actionBData = getCallData(fooAction, 'barUint1', [foo.address, ratio]);

        // Prepare task data
        // local stack idx start from [+2] if using dynamic array
        // because it will store 2 extra data(pointer and array length) to local stack in the first and second index
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0005000000000000000000000000000000000000000000000000000000000000', // be referenced
            '0x0100000000000000000203ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] -> local stack[3]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(secAmt.mul(ratio).div(ether('1')));
      });

      it('replace third parameter', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar2', [
          foo.address,
          '0x000000000000000000000000000000000000000000000000000000000000000a',
          constants.HashZero,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000400ffffffffffffffffffffffffffffffffffffffffff', // replace params[2] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter by 50% of ref value', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'barUint', [foo.address]);

        const percent = ether('0.5');
        const actionBData = getCallData(fooAction, 'barUint1', [foo.address, percent]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq((await foo.callStatic.barUint()).mul(percent).div(ether('1')));
      });

      it('replace dynamic array parameter with dynamic array return', async function () {
        // Prepare action data
        const expectNList = [BigNumber.from(300), BigNumber.from(100), BigNumber.from(75)];
        const actionAData = getCallData(fooAction, 'barUList', [
          foo.address,
          expectNList[0],
          expectNList[1],
          expectNList[2],
        ]);
        const actionBData = getCallData(fooAction, 'barUList2', [
          foo.address,
          [BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)],
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0005000000000000000000000000000000000000000000000000000000000000', // be referenced
            // replace params[5] <- local stack[4]
            // replace params[4] <- local stack[3]
            // replace params[3] <- local stack[2]
            '0x01000000000000000038040302ffffffffffffffffffffffffffffffffffffff',
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        for (let i = 0; i < expectNList.length; i++) {
          expect(await foo.nList(i)).to.be.eq(expectNList[i]);
        }
      });

      it('should revert: location count less than ref count', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x010000000000000000020000ffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (1, 2)
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Location count less than ref count');
      });

      it('should revert: location count greater than ref count', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000300ffffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (2, 1)
          ],
          [actionAData, actionBData],
        ]);

        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Location count exceeds ref count');
      });

      it('should revert: ref to out of localStack', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0001000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0100000000000000000201ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[1]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(30)'); // TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK
      });

      it('should revert: expected return amount not match', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            // expect 2 32-bytes return but will only get 1
            '0x0002000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(31)'); // TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED
      });

      it('should revert: overflow during trimming', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'barUint', [foo.address]);
        const actionBData = getCallData(fooAction, 'barUint1', [foo.address, constants.MaxUint256]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, fooAction.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.reverted;
      });

      it('should revert: illegal length for parse', async function () {
        const taskExecutorMock = await (
          await ethers.getContractFactory('TaskExecutorMock')
        ).deploy(owner.address, comptroller.address);
        await taskExecutorMock.deployed();

        // Prepare task data and execute
        const localStack = new Array<BytesLike>(256);
        localStack.fill(constants.HashZero);
        const data = getCallData(taskExecutorMock, 'parse', [
          localStack,
          '0x00010000000000000000000000000000000000000000000000000000000000', // 30 bytes
          1,
        ]);
        const target = taskExecutorMock.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(32)'); // TASK_EXECUTOR_ILLEGAL_LENGTH_FOR_PARSE
      });

      it('should revert: stack overflow', async function () {
        const taskExecutorMock = await (
          await ethers.getContractFactory('TaskExecutorMock')
        ).deploy(owner.address, comptroller.address);
        await taskExecutorMock.deployed();

        // Prepare task data and execute
        const localStack = new Array<BytesLike>(256);
        localStack.fill(constants.HashZero);
        const data = getCallData(taskExecutorMock, 'parse', [
          localStack,
          '0x0001000000000000000000000000000000000000000000000000000000000000',
          257,
        ]);
        const target = taskExecutorMock.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(33)'); // TASK_EXECUTOR_STACK_OVERFLOW
      });
    });

    describe('dynamic parameter by call', function () {
      it('replace parameter', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000100ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter with dynamic array return', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const secAmt = ether('2');
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUList', [ether('1'), secAmt, ether('1')]);

        const actionBEthValue = ether('0');
        const ratio = ether('0.7');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUint1', [ratio]);

        // Prepare task data and execute
        // local stack idx start from [+2] if using dynamic array
        // because it will store 2 extra data(pointer and array length) to local stack in the first and second index
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            '0x0205000000000000000000000000000000000000000000000000000000000000', // be referenced
            '0x0300000000000000000103ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[3]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(secAmt.mul(ratio).div(ether('1')));
      });

      it('replace second parameter', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar2', [
          '0x000000000000000000000000000000000000000000000000000000000000000a',
          constants.HashZero,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter by 50% of ref value', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUint', []);

        const actionBEthValue = ether('0');
        const percent = ether('0.5');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUint1', [percent]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000100ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq((await foo.callStatic.barUint()).mul(percent).div(ether('1')));
      });

      it('replace dynamic array parameter with dynamic array return', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const expectNList = [BigNumber.from(300), BigNumber.from(100), BigNumber.from(75)];
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUList', [
          expectNList[0],
          expectNList[1],
          expectNList[2],
        ]);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUList2', [
          [BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)],
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            '0x0205000000000000000000000000000000000000000000000000000000000000', // be referenced
            // replace params[4] <- local stack[4]
            // replace params[3] <- local stack[3]
            // replace params[2] <- local stack[2]
            '0x0300000000000000001C040302ffffffffffffffffffffffffffffffffffffff',
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        for (let i = 0; i < expectNList.length; i++) {
          expect(await foo.nList(i)).to.be.eq(expectNList[i]);
        }
      });

      it('should revert: location count less than ref count', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x03000000000000000010000fffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (1, 2)
          ],
          [actionAData, actionBData],
        ]);

        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Location count less than ref count');
      });

      it('should revert: location count greater than ref count', async function () {
        // Prepare action data

        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar2', [constants.HashZero, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000300ffffffffffffffffffffffffffffffffffffffffff', // (locCount, refCount) = (2, 1)
          ],
          [actionAData, actionBData],
        ]);

        const target = taskExecutor.address;
        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('Location count exceeds ref count');
      });

      it('should revert: ref to out of localStack', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            // 1 32-bytes return value to be referenced
            '0x0201000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0300000000000000000101ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[1]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(30)'); // TASK_EXECUTOR_REFERENCE_TO_OUT_OF_LOCALSTACK
      });

      it('should revert: expected return amount not match', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            // expect 2 32-bytes return but will only get 1
            '0x0202000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0300000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.revertedWith('RevertCode(31)'); // TASK_EXECUTOR_RETURN_NUM_AND_PARSED_RETURN_NUM_NOT_MATCHED
      });

      it('should revert: overflow during trimming', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUint', []);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUint1', [constants.MaxUint256]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, foo.address],
          [
            // expect 2 32-bytes return but will only get 1
            '0x0201000000000000000000000000000000000000000000000000000000000000', // set localStack[0]
            '0x0300000000000000000100ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;

        await expect(
          proxy.connect(user).executeMock(target, data, {
            value: ether('0.01'),
          })
        ).to.be.reverted;
      });
    });

    describe('dynamic parameter by mix call', function () {
      it('replace parameter by delegate call + call', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar1', [constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, foo.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000100ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter by call + delegate call', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        const actionBData = getCallData(fooAction, 'bar1', [foo.address, constants.HashZero]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, fooAction.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter with dynamic array return by delegate call + call', async function () {
        // Prepare action data
        const secAmt = ether('2');
        const actionAData = getCallData(fooAction, 'barUList', [foo.address, ether('1'), secAmt, ether('1')]);

        const actionBEthValue = ether('0');
        const ratio = ether('0.7');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUint1', [ratio]);

        // Prepare task data and execute
        // local stack idx start from [+2] if using dynamic array
        // because it will store 2 extra data(pointer and array length) to local stack in the first and second index
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, foo.address],
          [
            '0x0005000000000000000000000000000000000000000000000000000000000000', // be referenced
            '0x0300000000000000000103ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[3]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq(secAmt.mul(ratio).div(ether('1')));
      });

      it('replace parameter with dynamic array return by call + delegate call', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const secAmt = ether('1');
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUList', [ether('1'), secAmt, ether('1')]);
        const ratio = ether('0.7');
        const actionBData = getCallData(fooAction, 'barUint1', [foo.address, ratio]);

        // Prepare task data and execute
        // local stack idx start from [+2] if using dynamic array
        // because it will store 2 extra data(pointer and array length) to local stack in the first and second index
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, fooAction.address],
          [
            '0x0205000000000000000000000000000000000000000000000000000000000000', // be referenced
            '0x0100000000000000000203ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[3]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        expect(await foo.nValue()).to.be.eq(secAmt.mul(ratio).div(ether('1')));
      });

      it('replace second parameter by delegate call + call', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'bar', [foo.address]);
        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'bar2', [
          '0x000000000000000000000000000000000000000000000000000000000000000a',
          constants.HashZero,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, foo.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace third parameter by call + delegate call', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'bar', []);

        // Prepare action data
        const actionBData = getCallData(fooAction, 'bar2', [
          foo.address,
          '0x000000000000000000000000000000000000000000000000000000000000000a',
          constants.HashZero,
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, fooAction.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000400ffffffffffffffffffffffffffffffffffffffffff', // replace params[2] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.bValue()).eq(await foo.bar());
      });

      it('replace parameter by 50% of ref value by delegate call + call', async function () {
        // Prepare action data
        const actionAData = getCallData(fooAction, 'barUint', [foo.address]);

        const actionBEthValue = ether('0');
        const percent = ether('0.5');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUint1', [percent]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, foo.address],
          [
            '0x0001000000000000000000000000000000000000000000000000000000000000',
            '0x0300000000000000000100ffffffffffffffffffffffffffffffffffffffffff', // replace params[0] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq((await foo.callStatic.barUint()).mul(percent).div(ether('1')));
      });

      it('replace parameter by 50% of ref value by call + delegate call', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUint', []);

        const percent = ether('0.5');
        const actionBData = getCallData(fooAction, 'barUint1', [foo.address, percent]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, fooAction.address],
          [
            '0x0201000000000000000000000000000000000000000000000000000000000000',
            '0x0100000000000000000200ffffffffffffffffffffffffffffffffffffffffff', // replace params[1] <- local stack[0]
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        expect(await foo.nValue()).to.be.eq((await foo.callStatic.barUint()).mul(percent).div(ether('1')));
      });

      it('replace dynamic array parameter with dynamic array return by delegate call + call', async function () {
        // Prepare action data
        const expectNList = [BigNumber.from(300), BigNumber.from(100), BigNumber.from(75)];
        const actionAData = getCallData(fooAction, 'barUList', [
          foo.address,
          expectNList[0],
          expectNList[1],
          expectNList[2],
        ]);

        const actionBEthValue = ether('0');
        const actionBData = getCallActionData(actionBEthValue, foo, 'barUList2', [
          [BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)],
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [fooAction.address, foo.address],
          [
            '0x0005000000000000000000000000000000000000000000000000000000000000', // be referenced
            // replace params[4] <- local stack[4]
            // replace params[3] <- local stack[3]
            // replace params[2] <- local stack[2]
            '0x0300000000000000001C040302ffffffffffffffffffffffffffffffffffffff',
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        for (let i = 0; i < expectNList.length; i++) {
          expect(await foo.nList(i)).to.be.eq(expectNList[i]);
        }
      });

      it('replace dynamic array parameter with dynamic array return by call + delegate call', async function () {
        // Prepare action data
        const actionAEthValue = ether('0');
        const expectNList = [BigNumber.from(300), BigNumber.from(100), BigNumber.from(75)];
        const actionAData = getCallActionData(actionAEthValue, foo, 'barUList', [
          expectNList[0],
          expectNList[1],
          expectNList[2],
        ]);

        const actionBData = getCallData(fooAction, 'barUList2', [
          foo.address,
          [BigNumber.from(0), BigNumber.from(0), BigNumber.from(0)],
        ]);

        // Prepare task data and execute
        const data = getCallData(taskExecutor, 'batchExec', [
          [],
          [],
          [foo.address, fooAction.address],
          [
            '0x0205000000000000000000000000000000000000000000000000000000000000', // be referenced
            // replace params[5] <- local stack[4]
            // replace params[4] <- local stack[3]
            // replace params[3] <- local stack[2]
            '0x01000000000000000038040302ffffffffffffffffffffffffffffffffffffff',
          ],
          [actionAData, actionBData],
        ]);
        const target = taskExecutor.address;
        await proxy.connect(user).executeMock(target, data, {
          value: ether('0.01'),
        });

        // Verify
        for (let i = 0; i < expectNList.length; i++) {
          expect(await foo.nList(i)).to.be.eq(expectNList[i]);
        }
      });
    });
  });
});
