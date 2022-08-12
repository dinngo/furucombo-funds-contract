import { constants, Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  HMock,
  Faucet,
  IERC20,
  FurucomboRegistry,
  IATokenV3,
  SimpleToken,
  IPool,
  HAaveProtocolV3,
  FurucomboProxyMock,
  IVariableDebtToken,
  IStableDebtToken,
} from '../../typechain';

import {
  DAI_TOKEN,
  WMATIC_TOKEN,
  AWMATIC_V3,
  AAVE_RATEMODE,
  ADAI_V3_DEBT_STABLE,
  ADAI_V3_DEBT_VARIABLE,
  AAVEPROTOCOL_V3_PROVIDER,
} from '../utils/constants';

import {
  ether,
  simpleEncode,
  asciiToHex32,
  tokenProviderQuick,
  balanceDelta,
  padRightZero,
  expectEqWithinBps,
} from '../utils/utils';

describe('Aave V3 Flashloan', function () {
  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let tokenA: IERC20;
  let tokenB: IERC20;
  let aToken: IATokenV3;
  let mockToken: SimpleToken;
  let tokenAProvider: Signer;
  let tokenBProvider: Signer;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hAaveV3: HAaveProtocolV3;
  let hMock: HMock;
  let pool: IPool;
  let stableDebtTokenA: IStableDebtToken;
  let variableDebtTokenA: IVariableDebtToken;
  let faucet: Faucet;

  let userBalance: BigNumber;
  let tokenAUser: BigNumber;
  let tokenBUser: BigNumber;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    tokenA = await ethers.getContractAt('IERC20', DAI_TOKEN);
    tokenB = await ethers.getContractAt('IERC20', WMATIC_TOKEN);
    tokenAProvider = await tokenProviderQuick(tokenA.address);
    tokenBProvider = await tokenProviderQuick(tokenB.address);
    aToken = await ethers.getContractAt('IATokenV3', AWMATIC_V3);
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

    hMock = await (await ethers.getContractFactory('HMock')).deploy();
    await hMock.deployed();
    await registry.register(hMock.address, asciiToHex32('HMock'));

    await registry.registerCaller(pool.address, padRightZero(hAaveV3.address, 24));

    faucet = await (await ethers.getContractFactory('Faucet')).deploy();
    await faucet.deployed();

    stableDebtTokenA = await ethers.getContractAt('IStableDebtToken', ADAI_V3_DEBT_STABLE);
    variableDebtTokenA = await ethers.getContractAt('IVariableDebtToken', ADAI_V3_DEBT_VARIABLE);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Pool as handler', function () {
    it('Will success if pool is registered as handler', async function () {
      await registry.register(pool.address, padRightZero(hAaveV3.address, 24));

      const to = pool.address;
      const data = simpleEncode('initialize(address,bytes)', [registry.address, '0x']);

      await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });
    });

    it('Will revert if pool is registered as caller only', async function () {
      const to = pool.address;
      const data = simpleEncode('initialize(address,bytes)', [registry.address, '0x']);

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'Invalid handler'
      );
    });
  });

  describe('Normal', function () {
    beforeEach(async function () {
      await tokenA.connect(tokenAProvider).transfer(faucet.address, ether('100'));
      await tokenB.connect(tokenBProvider).transfer(faucet.address, ether('100'));

      tokenAUser = await tokenA.balanceOf(user.address);
      tokenBUser = await tokenB.balanceOf(user.address);

      const supplyAmount = ether('10000');
      await tokenB.connect(tokenBProvider).approve(pool.address, supplyAmount);
      await pool.connect(tokenBProvider).supply(tokenB.address, supplyAmount, user.address, 0);

      userBalance = await ethers.provider.getBalance(user.address);
    });

    it('Single asset with no debt', async function () {
      // Get flashloan params
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      // Get flashloan handler data
      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.NODEBT], // modes
        params
      );

      // Exec proxy
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Verify
      const fee = _getFlashloanFee(value);
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).sub(fee));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });

    it('single asset with stable rate by borrowing from itself', async function () {
      // Get flashloan params
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      // Get flashloan handler data
      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.STABLE], // modes
        params
      );

      // Approve delegation to proxy get the debt
      await stableDebtTokenA.connect(user).approveDelegation(proxy.address, value);

      // Exec proxy
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Verify
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).add(value));
      expectEqWithinBps(await stableDebtTokenA.balanceOf(user.address), value, 1);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });

    it('single asset with variable rate by borrowing from itself', async function () {
      // Get flashloan params
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      // Get flashloan handler data
      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.VARIABLE], // modes
        params
      );

      // Approve delegation to proxy get the debt
      await variableDebtTokenA.connect(user).approveDelegation(proxy.address, value);

      // Exec proxy
      userBalance = await ethers.provider.getBalance(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Verify
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).add(value));
      expectEqWithinBps(await variableDebtTokenA.balanceOf(user.address), value, 1);
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });

    it('multiple assets with no debt', async function () {
      // Get flashloan params
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      // Get flashloan handler data
      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params
      );

      // Exec proxy
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      const fee = _getFlashloanFee(value);
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).sub(fee));
      expect(await tokenB.balanceOf(user.address)).to.be.eq(tokenBUser.add(value).sub(fee));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });

    it('should revert: assets and amount do not match', async function () {
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params
      );

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_flashLoan: assets and amounts do not match'
      );
    });

    it('should revert: assets and modes do not match', async function () {
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT], // modes
        params
      );

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_flashLoan: assets and modes do not match'
      );
    });

    it('should revert: not approveDelegation to proxy', async function () {
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenA.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.VARIABLE], // modes
        params
      );

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_flashLoan: Unspecified'
      );
    });

    it('should revert: collateral same as borrowing currency', async function () {
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenB.address],
        [value]
      );

      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [tokenB.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.VARIABLE], // modes
        params
      );

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'AaveProtocolV3_flashLoan: Unspecified'
      );
    });

    it('should revert: not supported token', async function () {
      const value = ether('1');
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      const to = hAaveV3.address;
      const data = _getFlashloanCubeData(
        [mockToken.address], // assets
        [value], // amounts
        [AAVE_RATEMODE.STABLE], // modes
        params
      );

      await expect(proxy.connect(user).execMock(to, data, { value: ether('0.1') })).to.be.revertedWith(
        'HAaveProtocolV3_flashLoan: 27' // AAVEV3 Error Code: RESERVE_INACTIVE
      );
    });
  });

  describe('Multiple Cubes', function () {
    beforeEach(async function () {
      tokenAUser = await tokenA.balanceOf(user.address);
      tokenBUser = await tokenB.balanceOf(user.address);
      await tokenA.connect(tokenAProvider).transfer(faucet.address, ether('100'));
      await tokenB.connect(tokenBProvider).transfer(faucet.address, ether('100'));

      userBalance = await ethers.provider.getBalance(user.address);
    });

    it('sequential', async function () {
      const value = ether('1');
      // Setup 1st flashloan cube
      const params1 = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      const to1 = hAaveV3.address;
      const data1 = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params1
      );

      // Setup 2nd flashloan cube
      const params2 = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      const to2 = hAaveV3.address;
      const data2 = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params2
      );

      // Execute proxy batchExec
      const to = [to1, to2];
      const config = [constants.HashZero, constants.HashZero];
      const data = [data1, data2];
      const receipt = await proxy.connect(user).batchExec(to, config, data, {
        value: ether('0.1'),
      });

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      const fee = _getFlashloanFee(value.mul(BigNumber.from('2')));
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value.add(value)).sub(fee));
      expect(await tokenB.balanceOf(user.address)).to.be.eq(tokenBUser.add(value.add(value)).sub(fee));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });

    it('nested', async function () {
      // Get flashloan params
      const value = ether('1');
      const params1 = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address, faucet.address],
        [tokenA.address, tokenB.address],
        [value, value]
      );

      // Get 1st flashloan cube data
      const data1 = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params1
      );

      // Encode 1st flashloan cube data as flashloan param
      const params2 = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [[hAaveV3.address], [constants.HashZero], [data1]]
      );

      // Get 2nd flashloan cube data
      const data2 = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params2
      );

      const to = [hAaveV3.address];
      const config = [constants.HashZero];
      const data = [data2];
      const receipt = await proxy.connect(user).batchExec(to, config, data, {
        value: ether('0.1'),
      });

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      const fee = _getFlashloanFee(value.mul(BigNumber.from('2')));
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).sub(fee));
      expect(await tokenB.balanceOf(user.address)).to.be.eq(tokenBUser.add(value).sub(fee));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });
  });

  describe('supply', function () {
    beforeEach(async function () {
      tokenAUser = await tokenA.balanceOf(user.address);
      tokenBUser = await tokenB.balanceOf(user.address);
      await tokenA.connect(tokenAProvider).transfer(faucet.address, ether('100'));
      await tokenB.connect(tokenBProvider).transfer(faucet.address, ether('100'));
      userBalance = await ethers.provider.getBalance(user.address);
    });

    it('supply aaveV3 after flashloan', async function () {
      // Get flashloan params
      const value = ether('1');
      const supplyValue = ether('0.5');
      const testTo1 = [hMock.address, hAaveV3.address];
      const testConfig1 = [constants.HashZero, constants.HashZero];
      const testData1 = [
        simpleEncode('drainTokens(address[],address[],uint256[])', [
          [faucet.address, faucet.address],
          [tokenA.address, tokenB.address],
          [value, value],
        ]),
        simpleEncode('supply(address,uint256)', [tokenB.address, supplyValue]),
      ];

      const params1 = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [testTo1, testConfig1, testData1]
      );

      // Get flashloan cube data
      const data1 = _getFlashloanCubeData(
        [tokenA.address, tokenB.address], // assets
        [value, value], // amounts
        [AAVE_RATEMODE.NODEBT, AAVE_RATEMODE.NODEBT], // modes
        params1
      );

      const to = [hAaveV3.address];
      const config = [constants.HashZero];
      const data = [data1];
      const receipt = await proxy.connect(user).batchExec(to, config, data, {
        value: ether('0.1'),
      });

      // Verify proxy balance
      expect(await ethers.provider.getBalance(proxy.address)).to.be.eq(0);
      expect(await tokenA.balanceOf(proxy.address)).to.be.eq(0);
      expect(await tokenB.balanceOf(proxy.address)).to.be.eq(0);

      // Verify user balance
      const fee = _getFlashloanFee(value);
      expect(await tokenA.balanceOf(user.address)).to.be.eq(tokenAUser.add(value).sub(fee));
      expect(await tokenB.balanceOf(user.address)).to.be.eq(tokenBUser.add(value.sub(supplyValue).sub(fee)));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
    });
  });

  describe('Non-proxy', function () {
    beforeEach(async function () {
      await tokenA.connect(tokenAProvider).transfer(faucet.address, ether('100'));
    });

    it('should revert: not initiated by the proxy', async function () {
      const value = ether('1');
      // Setup 1st flashloan cube
      const params = _getFlashloanParams(
        [hMock.address],
        [constants.HashZero],
        [faucet.address],
        [tokenA.address],
        [value]
      );

      await expect(
        pool
          .connect(someone)
          .flashLoan(proxy.address, [tokenA.address], [value], [AAVE_RATEMODE.NODEBT], someone.address, params, 0)
      ).to.be.revertedWith('Sender is not initialized');
    });
  });

  describe('executeOperation', function () {
    it('should revert: non-lending pool call executeOperation() directly', async function () {
      const data = simpleEncode('executeOperation(address[],uint256[],uint256[],address,bytes)', [
        [],
        [],
        [],
        proxy.address,
        asciiToHex32('HMock'),
      ]);
      const to = hAaveV3.address;

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV3_executeOperation: invalid caller'
      );
    });
  });
});

function _getFlashloanParams(tos: any[], configs: any[], faucets: any[], tokens: any[], amounts: any[]) {
  const data = [simpleEncode('drainTokens(address[],address[],uint256[])', [faucets, tokens, amounts])];

  const params = ethers.utils.defaultAbiCoder.encode(['address[]', 'bytes32[]', 'bytes[]'], [tos, configs, data]);

  return params;
}

function _getFlashloanCubeData(assets: any[], amounts: any[], modes: any[], params: string) {
  const data = simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [assets, amounts, modes, params]);
  return data;
}

function _getFlashloanFee(value: BigNumber) {
  return value.mul(BigNumber.from('5')).div(BigNumber.from('10000'));
}
