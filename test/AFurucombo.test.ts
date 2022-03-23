import { Wallet, BigNumber, Signer, constants } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  PoolImplementation,
  AssetRouter,
  MortgageVault,
  TaskExecutorMock,
  IDSProxyRegistry,
  IERC20,
  AFurucombo,
  FurucomboProxy,
  Registry,
  HFunds,
  PoolProxyMock,
  Chainlink,
  AssetRegistry,
  IVariableDebtToken,
  SimpleToken,
} from '../typechain';

import {
  DS_PROXY_REGISTRY,
  DAI_TOKEN,
  DAI_PROVIDER,
  WETH_TOKEN,
  WL_ANY_SIG,
  NATIVE_TOKEN,
  FURUCOMBO_HQUICKSWAP,
  WMATIC_TOKEN,
  AWETH_V2_DEBT_VARIABLE,
  AAVEPROTOCOL_V2_PROVIDER,
} from './utils/constants';
import {
  getActionReturn,
  getCallData,
  ether,
  impersonateAndInjectEther,
  simpleEncode,
  asciiToHex32,
  getTaskExecutorFundQuotas,
  getTaskExecutorDealingAssets,
  profileGas,
  getFuncSig,
} from './utils/utils';

describe('AFurucombo', function () {
  const debtTokenAddress = AWETH_V2_DEBT_VARIABLE;

  let comptroller: ComptrollerImplementation;
  let poolImplementation: PoolImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let taskExecutor: TaskExecutorMock;
  let dsProxyRegistry: IDSProxyRegistry;
  let proxy: PoolProxyMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;

  let furucombo: FurucomboProxy;
  let aFurucombo: AFurucombo;
  let furuRegistry: Registry;
  let hFunds: HFunds;

  let token: IERC20;
  let tokenOut: IERC20;
  let debtToken: IVariableDebtToken;
  let tokenProvider: Signer;

  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenD: SimpleToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, collector] = await (ethers as any).getSigners();

      // Setup token and unlock provider
      tokenProvider = await impersonateAndInjectEther(DAI_PROVIDER);
      token = await ethers.getContractAt('IERC20', DAI_TOKEN);

      tokenOut = await ethers.getContractAt('IERC20', WETH_TOKEN);
      debtToken = await ethers.getContractAt(
        'IVariableDebtToken',
        debtTokenAddress
      );

      // Setup contracts
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
      ).deploy(token.address);
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
        0,
        mortgageVault.address,
        0
      );
      await comptroller.setInitialAssetCheck(false);

      taskExecutor = await (
        await ethers.getContractFactory('TaskExecutorMock')
      ).deploy(owner.address, comptroller.address);
      await taskExecutor.deployed();
      await comptroller.setExecAction(taskExecutor.address);

      // Setup furucombo and AFurucombo
      furuRegistry = await (
        await ethers.getContractFactory('Registry')
      ).deploy();
      await furuRegistry.deployed();

      furucombo = await (
        await ethers.getContractFactory('FurucomboProxy')
      ).deploy(furuRegistry.address);
      await furucombo.deployed();

      aFurucombo = await (
        await ethers.getContractFactory('AFurucombo')
      ).deploy(owner.address, furucombo.address, comptroller.address);
      await aFurucombo.deployed();

      hFunds = await (await ethers.getContractFactory('HFunds')).deploy();
      await hFunds.deployed();

      await furuRegistry.register(
        hFunds.address,
        ethers.utils.hexZeroPad(asciiToHex32('HFunds'), 32)
      );

      await furuRegistry.register(
        FURUCOMBO_HQUICKSWAP,
        ethers.utils.hexZeroPad(asciiToHex32('FURUCOMBO_HQUICKSWAP'), 32)
      );

      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();

      // Setup PoolProxy
      dsProxyRegistry = await ethers.getContractAt(
        'IDSProxyRegistry',
        DS_PROXY_REGISTRY
      );

      proxy = await (await ethers.getContractFactory('PoolProxyMock'))
        .connect(user)
        .deploy(dsProxyRegistry.address);
      await proxy.deployed();

      await proxy.setComptroller(comptroller.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await proxy.setupDenomination(tokenD.address);
      await proxy.setVault();
      await proxy.setLevel(1);

      // Permit delegate calls
      comptroller.permitDelegateCalls(
        await proxy.level(),
        [aFurucombo.address],
        [WL_ANY_SIG]
      );

      // Permit handler
      comptroller.permitHandlers(
        await proxy.level(),
        [hFunds.address, FURUCOMBO_HQUICKSWAP],
        [getFuncSig(hFunds, 'updateTokens(address[])'), WL_ANY_SIG]
      );
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  // setupTest will use the evm_snapshot to reset environment to speed up testing
  beforeEach(async function () {
    await setupTest();
  });

  describe('inject and batchExec', function () {
    const furucomboTokenDust = BigNumber.from('10');

    it('remaining tokens < token dust', async function () {
      const amountIn = furucomboTokenDust.sub(BigNumber.from('1'));
      const tokensIn = [token.address];
      const amountsIn = [amountIn];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [
          tokensIn,
          amountsIn,
          [],
          [],
          [],
          [],
        ]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      // Execute
      await proxy.connect(user).executeMock(taskExecutor.address, data);

      const tokenFurucomboAfter = await token.balanceOf(furucombo.address);
      // Verify furucombo proxy
      expect(tokenFurucomboAfter).to.be.eq(amountIn);
    });

    it('should revert: inconsistent length', async function () {
      const tokensIn = [token.address];
      const amountsIn = [ether('1'), ether('1')];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [
          tokensIn,
          amountsIn,
          [],
          [],
          [],
          [],
        ]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      await expect(
        proxy.connect(user).executeMock(taskExecutor.address, data)
      ).to.be.revertedWith('revertCode(40)'); // AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });

    it('should revert: remaining tokens >= token dust', async function () {
      const tokensIn = [token.address];
      const amountsIn = [furucomboTokenDust];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [
          tokensIn,
          amountsIn,
          [],
          [],
          [],
          [],
        ]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      await expect(
        proxy.connect(user).executeMock(taskExecutor.address, data)
      ).to.be.revertedWith('revertCode(71)'); // AFURUCOMBO_REMAINING_TOKENS
    });

    it('should revert: invalid handler', async function () {
      const tokensIn: any[] = [];
      const amountsIn: any[] = [];
      const tokensOut: any[] = [];
      const tos = [hFunds.address];
      const configs = [
        '0x0003000000000000000000000000000000000000000000000000000000000000',
      ];
      const datas = [simpleEncode('_inject(address[],uint256[])', [[], []])];
      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [
          tokensIn,
          amountsIn,
          tokensOut,
          tos,
          configs,
          datas,
        ]),
      ]);

      // send token to vault
      // const vault = await proxy.vault();
      await expect(
        proxy.connect(user).executeMock(taskExecutor.address, data)
      ).to.be.revertedWith('revertCode(41)'); // AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL
    });
  });

  describe('approve delegation to proxy', function () {
    it('approve delegation', async function () {
      const vault = await proxy.vault();

      expect(
        await debtToken.borrowAllowance(vault, furucombo.address)
      ).to.be.eq(0);

      const borrowAmount = ether('0.05');
      const tokens = [debtToken.address];
      const amounts = [borrowAmount];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        [],
        [],
        aFurucombo.address,
        getCallData(aFurucombo, 'approveDelegation', [tokens, amounts]),
      ]);

      // Execute
      const receipt = await proxy
        .connect(user)
        .executeMock(taskExecutor.address, data);

      expect(
        await debtToken.borrowAllowance(vault, furucombo.address)
      ).to.be.eq(borrowAmount);

      await profileGas(receipt);
    });

    it('should revert: inconsistent length', async function () {
      const borrowAmount = ether('0.05');
      const tokens = [debtToken.address];
      const amounts = [borrowAmount, borrowAmount];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        [],
        [],
        aFurucombo.address,
        getCallData(aFurucombo, 'approveDelegation', [tokens, amounts]),
      ]);

      await expect(
        proxy.connect(user).executeMock(taskExecutor.address, data)
      ).to.be.revertedWith('revertCode(40)'); // AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });
  });
});
