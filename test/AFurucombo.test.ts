import { Wallet, BigNumber, Signer, constants } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  FundImplementation,
  AssetRouter,
  MortgageVault,
  TaskExecutorMock,
  IDSProxyRegistry,
  IERC20,
  AFurucombo,
  FurucomboProxy,
  FurucomboRegistry,
  HFunds,
  HMock,
  Faucet,
  FundProxyMock,
  Chainlink,
  AssetRegistry,
  IVariableDebtToken,
  SimpleToken,
  HQuickSwap,
} from '../typechain';

import {
  DS_PROXY_REGISTRY,
  DAI_TOKEN,
  DAI_PROVIDER,
  WETH_TOKEN,
  WL_ANY_SIG,
  AWETH_V2_DEBT_VARIABLE,
  FUND_PERCENTAGE_BASE,
} from './utils/constants';
import {
  getActionReturn,
  getCallData,
  ether,
  impersonateAndInjectEther,
  simpleEncode,
  asciiToHex32,
  getTaskExecutorAssetQuotas,
  getTaskExecutorDealingAssets,
  profileGas,
  getFuncSig,
} from './utils/utils';

describe('AFurucombo', function () {
  const debtTokenAddress = AWETH_V2_DEBT_VARIABLE;

  let comptroller: ComptrollerImplementation;
  let fundImplementation: FundImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let taskExecutor: TaskExecutorMock;
  let dsProxyRegistry: IDSProxyRegistry;
  let proxy: FundProxyMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;
  let liquidator: Wallet;

  let furucombo: FurucomboProxy;
  let aFurucombo: AFurucombo;
  let furuRegistry: FurucomboRegistry;
  let hFunds: HFunds;
  let hMock: HMock;
  let hQuickSwap: HQuickSwap;
  let faucet: Faucet;

  let token: IERC20;
  let tokenOut: IERC20;
  let debtToken: IVariableDebtToken;
  let tokenProvider: Signer;

  let oracle: Chainlink;
  let registry: AssetRegistry;

  let tokenD: SimpleToken;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, collector, liquidator] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    tokenProvider = await impersonateAndInjectEther(DAI_PROVIDER);
    token = await ethers.getContractAt('IERC20', DAI_TOKEN);

    tokenOut = await ethers.getContractAt('IERC20', WETH_TOKEN);
    debtToken = await ethers.getContractAt('IVariableDebtToken', debtTokenAddress);

    // Setup contracts
    fundImplementation = await (await ethers.getContractFactory('FundImplementation')).deploy();
    await fundImplementation.deployed();

    registry = await (await ethers.getContractFactory('AssetRegistry')).deploy();
    await registry.deployed();

    oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
    await oracle.deployed();

    assetRouter = await (await ethers.getContractFactory('AssetRouter')).deploy(oracle.address, registry.address);
    await assetRouter.deployed();

    mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(token.address);
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
      0,
      mortgageVault.address,
      0,
      DS_PROXY_REGISTRY,
      setupAction.address
    );
    await comptroller.setInitialAssetCheck(false);

    taskExecutor = await (
      await ethers.getContractFactory('TaskExecutorMock')
    ).deploy(owner.address, comptroller.address);
    await taskExecutor.deployed();
    await comptroller.setExecAction(taskExecutor.address);

    // Setup furucombo and AFurucombo
    furuRegistry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await furuRegistry.deployed();

    furucombo = await (await ethers.getContractFactory('FurucomboProxy')).deploy(furuRegistry.address);
    await furucombo.deployed();

    aFurucombo = await (
      await ethers.getContractFactory('AFurucombo')
    ).deploy(owner.address, furucombo.address, comptroller.address);
    await aFurucombo.deployed();

    hFunds = await (await ethers.getContractFactory('HFunds')).deploy();
    await hFunds.deployed();

    hQuickSwap = await (await ethers.getContractFactory('HQuickSwap')).deploy();
    await hQuickSwap.deployed();

    hMock = await (await ethers.getContractFactory('HMock')).deploy();
    await hMock.deployed();

    await furuRegistry.register(hFunds.address, ethers.utils.hexZeroPad(asciiToHex32('HFunds'), 32));

    await furuRegistry.register(hQuickSwap.address, ethers.utils.hexZeroPad(asciiToHex32('HQuickswap'), 32));
    await furuRegistry.register(hMock.address, asciiToHex32('HMock'));

    tokenD = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await tokenD.deployed();

    // Setup FundProxy
    dsProxyRegistry = await ethers.getContractAt('IDSProxyRegistry', DS_PROXY_REGISTRY);

    proxy = await (await ethers.getContractFactory('FundProxyMock')).connect(user).deploy();
    await proxy.deployed();

    faucet = await (await ethers.getContractFactory('Faucet')).deploy();
    await faucet.deployed();

    await proxy.setComptroller(comptroller.address);
    await comptroller.permitDenominations([tokenD.address], [0]);
    await proxy.setDenomination(tokenD.address);
    await proxy.setVault(DS_PROXY_REGISTRY);
    await proxy.setLevel(1);

    // Permit delegate calls
    comptroller.permitDelegateCalls(await proxy.level(), [aFurucombo.address], [WL_ANY_SIG]);

    // Permit handler
    comptroller.permitHandlers(
      await proxy.level(),
      [hFunds.address, hQuickSwap.address, hMock.address],
      [getFuncSig(hFunds, 'updateTokens(address[])'), WL_ANY_SIG, WL_ANY_SIG]
    );
  });

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  // setupTest will use the evm_snapshot to reset environment to speed up testing
  beforeEach(async function () {
    await setupTest();
  });

  describe('inject and batchExec', function () {
    const furucomboTokenDust = BigNumber.from('10');

    it('swap token to token', async function () {
      const tokensIn = [token.address];
      const amountsIn = [ether('1')];
      const tokensOut = [tokenOut.address];
      const tos = [hFunds.address, hQuickSwap.address];
      const configs = [
        '0x0003000000000000000000000000000000000000000000000000000000000000', // return size = 3 (uint256[1])
        '0x0100000000000000000102ffffffffffffffffffffffffffffffffffffffffff', // ref location = stack[2]
      ];
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          0, // amountIn: 100% return data
          1, // amountOutMin
          [token.address, tokenOut.address], // path
        ]),
      ];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, tokensOut, tos, configs, datas]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      // Execute
      const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);

      // Record after balance
      const tokenAfter = await token.balanceOf(vault);
      const tokenOutAfter = await tokenOut.balanceOf(vault);
      const tokenFurucomboAfter = await token.balanceOf(furucombo.address);

      // Get assetQuotas and dealing asset
      const assetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutor, tokensIn);
      const outputAssetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutor, tokensOut);
      const dealingAssets = await getTaskExecutorDealingAssets(proxy, taskExecutor);

      // Verify action return
      const actionReturn = await getActionReturn(receipt, ['uint256[]']);
      expect(actionReturn[0]).to.be.eq(tokenOutAfter);

      // Verify user dsproxy
      expect(tokenAfter).to.be.eq(0);
      expect(tokenOutAfter).to.be.gt(0);

      // Verify furucombo proxy
      expect(tokenFurucomboAfter).to.be.lt(furucomboTokenDust);

      // Verify asset Quota
      for (let i = 0; i < assetQuotas.length; i++) {
        expect(assetQuotas[i]).to.be.lt(amountsIn[i]);
      }
      const tokenOutAfters = [tokenOutAfter];
      for (let i = 0; i < outputAssetQuotas.length; i++) {
        expect(outputAssetQuotas[i]).to.be.eq(tokenOutAfters[i]);
      }

      // Verify dealing asset
      for (let i = 0; i < dealingAssets.length; i++) {
        expect(tokensOut[i]).to.be.eq(
          dealingAssets[dealingAssets.length - (i + 1)] // returnTokens = dealingAssets.reverse()
        );
      }

      await profileGas(receipt);
    });

    it('remaining tokens < token dust', async function () {
      const amountIn = furucomboTokenDust.sub(BigNumber.from('1'));
      const tokensIn = [token.address];
      const amountsIn = [amountIn];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, [], [], [], []]),
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
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, [], [], [], []]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(40)'); // AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });

    it('should revert: remaining tokens >= token dust', async function () {
      const tokensIn = [token.address];
      const amountsIn = [furucomboTokenDust];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, [], [], [], []]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(71)'); // AFURUCOMBO_REMAINING_TOKENS
    });

    it('should revert: invalid handler', async function () {
      const tokensIn: any[] = [];
      const amountsIn: any[] = [];
      const tokensOut: any[] = [];
      const tos = [hFunds.address];
      const configs = ['0x0003000000000000000000000000000000000000000000000000000000000000'];
      const datas = [simpleEncode('_inject(address[],uint256[])', [[], []])];
      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, tokensOut, tos, configs, datas]),
      ]);

      // send token to vault
      // const vault = await proxy.vault();
      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(41)'); // AFURUCOMBO_INVALID_COMPTROLLER_HANDLER_CALL
    });

    it('should revert: duplicated tokensOut', async function () {
      const tokensIn = [token.address];
      const amountsIn = [ether('1')];
      const tokensOut = [tokenOut.address, tokenOut.address];
      const tos = [hFunds.address, hQuickSwap.address];
      const configs = [
        '0x0003000000000000000000000000000000000000000000000000000000000000', // return size = 3 (uint256[1])
        '0x0100000000000000000102ffffffffffffffffffffffffffffffffffffffffff', // ref location = stack[2]
      ];
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          0, // amountIn: 100% return data
          1, // amountOutMin
          [token.address, tokenOut.address], // path
        ]),
      ];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, tokensOut, tos, configs, datas]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      // send token to vault
      // const vault = await proxy.vault();
      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(86)'); // AFURUCOMBO_DUPLICATED_TOKENSOUT
    });

    it('should revert: not ascending tokensOut', async function () {
      const tokensIn = [token.address];
      const amountsIn = [ether('1')];

      let tokensOut;
      if (token.address > tokenOut.address) {
        tokensOut = [token.address, tokenOut.address, token.address];
      } else {
        tokensOut = [tokenOut.address, token.address, tokenOut.address];
      }

      const tos = [hFunds.address, hQuickSwap.address];
      const configs = [
        '0x0003000000000000000000000000000000000000000000000000000000000000', // return size = 3 (uint256[1])
        '0x0100000000000000000102ffffffffffffffffffffffffffffffffffffffffff', // ref location = stack[2]
      ];
      const datas = [
        simpleEncode('updateTokens(address[])', [tokensIn]),
        simpleEncode('swapExactTokensForTokens(uint256,uint256,address[])', [
          0, // amountIn: 100% return data
          1, // amountOutMin
          [token.address, tokenOut.address], // path
        ]),
      ];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        tokensIn,
        amountsIn,
        aFurucombo.address,
        getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, amountsIn, tokensOut, tos, configs, datas]),
      ]);

      // send token to vault
      const vault = await proxy.vault();
      await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

      // send token to vault
      // const vault = await proxy.vault();
      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(86)'); // AFURUCOMBO_DUPLICATED_TOKENSOUT
    });

    describe('asset Quota', function () {
      it('input token == output token: the same amount', async function () {
        const amountIn = ether('1');
        const consumeAmount = amountIn.sub(
          amountIn.mul(await comptroller.execFeePercentage()).div(FUND_PERCENTAGE_BASE)
        );
        const tokensIn = [token.address];
        const tokensOut = [token.address];
        const amountsIn = [amountIn];
        const tos = [hFunds.address, hMock.address];
        const configs = [constants.HashZero, constants.HashZero];
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('doUpdateTokenOnly(address[])', [tokensIn]),
        ];

        // TaskExecutorMock data
        const injectAmounts = [consumeAmount];
        const data = getCallData(taskExecutor, 'execMock', [
          tokensIn,
          amountsIn,
          aFurucombo.address,
          getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, injectAmounts, tokensOut, tos, configs, datas]),
        ]);

        // Send token to vault
        const vault = await proxy.vault();
        await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

        // Execute
        const vaultTokenBalanceBefore = await token.balanceOf(vault);
        const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);
        const vaultTokenBalanceAfter = await token.balanceOf(vault);

        // Record after balance
        const tokenFurucomboAfter = await token.balanceOf(furucombo.address);

        // Get assetQuotas and dealing asset
        const assetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutor, tokensIn);

        const dealingAssets = await getTaskExecutorDealingAssets(proxy, taskExecutor);

        // Verify user dsproxy
        expect(vaultTokenBalanceAfter).to.be.eq(vaultTokenBalanceBefore);

        // Verify furucombo proxy
        expect(tokenFurucomboAfter).to.be.lt(furucomboTokenDust);

        // Verify asset Quota
        const feePercentage = await comptroller.execFeePercentage();
        for (let i = 0; i < assetQuotas.length; i++) {
          expect(assetQuotas[i]).to.be.eq(amountsIn[i].sub(amountsIn[i].mul(feePercentage).div(FUND_PERCENTAGE_BASE)));
        }

        // Verify dealing asset
        for (let i = 0; i < dealingAssets.length; i++) {
          expect(tokensOut[i]).to.be.eq(
            dealingAssets[dealingAssets.length - (i + 1)] // returnTokens = dealingAssets.reverse()
          );
        }

        await profileGas(receipt);
      });

      it('input token == output token: input amount > output amount', async function () {
        const amountIn = ether('1');
        const consumeAmount = amountIn.sub(
          amountIn.mul(await comptroller.execFeePercentage()).div(FUND_PERCENTAGE_BASE)
        );
        const tokensIn = [token.address];
        const targets = [await tokenProvider.getAddress()];
        const tokensOut = [token.address];
        const amountsIn = [amountIn];
        const tos = [hFunds.address, hMock.address];
        const configs = [constants.HashZero, constants.HashZero];

        const sendTokenAmount = consumeAmount.div(BigNumber.from(2));
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('sendTokens(address[],address[],uint256[])', [targets, tokensIn, [sendTokenAmount]]),
        ];

        // TaskExecutorMock data
        const injectAmounts = [consumeAmount];
        const data = getCallData(taskExecutor, 'execMock', [
          tokensIn,
          amountsIn,
          aFurucombo.address,
          getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, injectAmounts, tokensOut, tos, configs, datas]),
        ]);

        // send token to vault
        const vault = await proxy.vault();
        await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

        // Execute
        const vaultTokenBalanceBefore = await token.balanceOf(vault);
        const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);
        const vaultTokenBalanceAfter = await token.balanceOf(vault);

        // Record after balance
        const tokenFurucomboAfter = await token.balanceOf(furucombo.address);

        // Get assetQuotas and dealing asset
        const assetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutor, tokensIn);

        const dealingAssets = await getTaskExecutorDealingAssets(proxy, taskExecutor);

        // Verify user dsproxy
        expect(vaultTokenBalanceAfter).to.be.lt(vaultTokenBalanceBefore);

        // Verify furucombo proxy
        expect(tokenFurucomboAfter).to.be.lt(furucomboTokenDust);

        // Verify asset Quota
        for (let i = 0; i < assetQuotas.length; i++) {
          expect(assetQuotas[i]).to.be.eq(amountIn.sub(consumeAmount).add(sendTokenAmount));
        }

        // Verify dealing asset
        for (let i = 0; i < dealingAssets.length; i++) {
          expect(tokensOut[i]).to.be.eq(
            dealingAssets[dealingAssets.length - (i + 1)] // returnTokens = dealingAssets.reverse()
          );
        }

        await profileGas(receipt);
      });

      it('input token == output token: input amount < output amount', async function () {
        // Send token to faucet
        await token.connect(tokenProvider).transfer(faucet.address, ether('100'));

        const amountIn = ether('1');
        const consumeAmount = amountIn.sub(
          amountIn.mul(await comptroller.execFeePercentage()).div(FUND_PERCENTAGE_BASE)
        );
        const tokensIn = [token.address];
        const targets = [faucet.address];
        const tokensOut = [token.address];
        const amountsIn = [amountIn];
        const tos = [hFunds.address, hMock.address];
        const configs = [constants.HashZero, constants.HashZero];
        const datas = [
          simpleEncode('updateTokens(address[])', [tokensIn]),
          simpleEncode('drainTokens(address[],address[],uint256[])', [targets, tokensIn, [consumeAmount]]),
        ];

        // TaskExecutorMock data
        const injectAmounts = [consumeAmount];
        const data = getCallData(taskExecutor, 'execMock', [
          tokensIn,
          amountsIn,
          aFurucombo.address,
          getCallData(aFurucombo, 'injectAndBatchExec', [tokensIn, injectAmounts, tokensOut, tos, configs, datas]),
        ]);

        // send token to vault
        const vault = await proxy.vault();
        await token.connect(tokenProvider).transfer(vault, amountsIn[0]);

        // Execute
        const vaultTokenBalanceBefore = await token.balanceOf(vault);
        const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);
        const vaultTokenBalanceAfter = await token.balanceOf(vault);

        // Record after balance
        const tokenFurucomboAfter = await token.balanceOf(furucombo.address);

        // Get assetQuotas and dealing asset
        const assetQuotas = await getTaskExecutorAssetQuotas(proxy, taskExecutor, tokensIn);

        const dealingAssets = await getTaskExecutorDealingAssets(proxy, taskExecutor);

        // Verify user dsproxy
        expect(vaultTokenBalanceAfter).to.be.gt(vaultTokenBalanceBefore);

        // Verify furucombo proxy
        expect(tokenFurucomboAfter).to.be.lt(furucomboTokenDust);

        // Verify asset Quota
        for (let i = 0; i < assetQuotas.length; i++) {
          expect(assetQuotas[i]).to.be.eq(
            // Set consumeAmount to asset quota at the first
            // then add generated token from faucet to asset quota
            amountIn.sub(consumeAmount).add(consumeAmount.mul(2))
          );
        }

        // Verify dealing asset
        for (let i = 0; i < dealingAssets.length; i++) {
          expect(tokensOut[i]).to.be.eq(
            dealingAssets[dealingAssets.length - (i + 1)] // returnTokens = dealingAssets.reverse()
          );
        }

        await profileGas(receipt);
      });
    });
  });

  describe('approve delegation to proxy', function () {
    it('approve delegation', async function () {
      const vault = await proxy.vault();

      expect(await debtToken.borrowAllowance(vault, furucombo.address)).to.be.eq(0);

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
      const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);

      expect(await debtToken.borrowAllowance(vault, furucombo.address)).to.be.eq(borrowAmount);

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

      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(40)'); // AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });
  });

  describe('approve token to proxy', function () {
    it('approve token', async function () {
      const tokenA = token;
      const tokenB = tokenOut;
      const tokens = [tokenA.address, tokenB.address];
      const vault = await proxy.vault();

      expect(await tokenA.allowance(vault, furucombo.address)).to.be.eq(0);
      expect(await tokenB.allowance(vault, furucombo.address)).to.be.eq(0);

      const approveTokenAAmount = ether('0.05');
      const approveTokenBAmount = ether('100');
      const amounts = [approveTokenAAmount, approveTokenBAmount];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        [],
        [],
        aFurucombo.address,
        getCallData(aFurucombo, 'approveToken', [tokens, amounts]),
      ]);

      // Execute
      const receipt = await proxy.connect(user).executeMock(taskExecutor.address, data);

      expect(await tokenA.allowance(vault, furucombo.address)).to.be.eq(approveTokenAAmount);
      expect(await tokenB.allowance(vault, furucombo.address)).to.be.eq(approveTokenBAmount);

      await profileGas(receipt);
    });

    it('should revert: inconsistent length', async function () {
      const tokenA = token;
      const tokenB = tokenOut;
      const tokens = [tokenA.address, tokenB.address];
      const approveTokenAAmount = ether('0.05');
      const amounts = [approveTokenAAmount];

      // TaskExecutorMock data
      const data = getCallData(taskExecutor, 'execMock', [
        [],
        [],
        aFurucombo.address,
        getCallData(aFurucombo, 'approveToken', [tokens, amounts]),
      ]);

      await expect(proxy.connect(user).executeMock(taskExecutor.address, data)).to.be.revertedWith('RevertCode(40)'); // AFURUCOMBO_TOKENS_AND_AMOUNTS_LENGTH_INCONSISTENT
    });
  });
});
