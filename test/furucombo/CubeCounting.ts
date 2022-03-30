import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  FurucomboProxy,
  FurucomboRegistry,
  HAaveProtocolV2,
  IERC20,
  HFunds,
  ILendingPoolV2,
} from '../../typechain';

import { WMATIC_TOKEN, AAVE_RATEMODE, AAVEPROTOCOL_V2_PROVIDER } from '../utils/constants';
import { ether, simpleEncode, asciiToHex32, padRightZero } from '../utils/utils';

describe('CubeCounting', function () {
  let user: Wallet;

  let proxy: FurucomboProxyMock;
  let furucomboProxy: FurucomboProxy;
  let registry: FurucomboRegistry;
  let hAaveV2: HAaveProtocolV2;
  let hFunds: HFunds;
  let lendingPool: ILendingPoolV2;

  let tokenA: IERC20;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [, user] = await (ethers as any).getSigners();

    // Setup token
    tokenA = await ethers.getContractAt('IERC20', WMATIC_TOKEN);

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    furucomboProxy = await (await ethers.getContractFactory('FurucomboProxy')).deploy(registry.address);
    await furucomboProxy.deployed();

    // Deploy handler and register
    hAaveV2 = await (await ethers.getContractFactory('HAaveProtocolV2')).deploy();
    await hAaveV2.deployed();
    await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

    hFunds = await (await ethers.getContractFactory('HFunds')).deploy();
    await hFunds.deployed();
    await registry.register(hFunds.address, asciiToHex32('HFunds'));

    // Register Aave caller
    const provider = await ethers.getContractAt('ILendingPoolAddressesProviderV2', AAVEPROTOCOL_V2_PROVIDER);

    lendingPool = await ethers.getContractAt('ILendingPoolV2', await provider.getLendingPool());
    await registry.registerCaller(lendingPool.address, padRightZero(hAaveV2.address, 24));
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('FlashLoan', function () {
    it('should revert: invalid callback data', async function () {
      // FlashLoan with invalid callback data
      const value = ether('1');
      const to = hAaveV2.address;

      // Prepare data
      const flashloanParams = ethers.utils.defaultAbiCoder.encode(['address[]', 'bytes32[]', 'bytes[]'], [[], [], []]);

      const flashloanCubeData = simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [
        [tokenA.address],
        [ether('10')],
        [AAVE_RATEMODE.NODEBT],
        flashloanParams,
      ]);

      await expect(proxy.connect(user).execMock(to, flashloanCubeData)).to.be.revertedWith(
        '0_HAaveProtocolV2_flashLoan'
      );
    });
    it('should revert: 0 -> 0', async function () {
      const to = hAaveV2.address;

      // Prepare flashloan data
      const data = [simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], []])];
      const flashloanParams = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [[hFunds.address], [constants.HashZero], data]
      );

      const flashloanCubeData = simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [
        [tokenA.address],
        [ether('10')],
        [AAVE_RATEMODE.NODEBT],
        flashloanParams,
      ]);

      await expect(proxy.connect(user).execMock(to, flashloanCubeData)).to.be.revertedWith(
        '0_HAaveProtocolV2_flashLoan: 0_HFunds_checkSlippage'
      );
    });

    it('should revert: 0 -> 1', async function () {
      const to = hAaveV2.address;

      // Prepare flashloan data
      const data = [
        simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], [0]]),
        simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], []]),
      ];
      const flashloanParams = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [[hFunds.address, hFunds.address], [constants.HashZero, constants.HashZero], data]
      );

      const flashloanCubeData = simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [
        [tokenA.address],
        [ether('10')],
        [AAVE_RATEMODE.NODEBT],
        flashloanParams,
      ]);

      await expect(proxy.connect(user).execMock(to, flashloanCubeData)).to.be.revertedWith(
        '0_HAaveProtocolV2_flashLoan: 1_HFunds_checkSlippage'
      );
    });

    it('should revert: 1 -> 1', async function () {
      const tos = [hFunds.address, hAaveV2.address];
      const configs = [constants.HashZero, constants.HashZero];

      const firstCubeData = simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], [0]]);

      // Prepare flashloan data
      const data = [
        simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], [0]]),
        simpleEncode('checkSlippage(address[],uint256[])', [[tokenA.address], []]),
      ];
      const flashloanParams = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [[hFunds.address, hFunds.address], [constants.HashZero, constants.HashZero], data]
      );

      const flashloanCubeData = simpleEncode('flashLoan(address[],uint256[],uint256[],bytes)', [
        [tokenA.address],
        [ether('10')],
        [AAVE_RATEMODE.NODEBT],
        flashloanParams,
      ]);

      const proxyDatas = [firstCubeData, flashloanCubeData];

      await expect(furucomboProxy.connect(user).batchExec(tos, configs, proxyDatas)).to.be.revertedWith(
        '1_HAaveProtocolV2_flashLoan: 1_HFunds_checkSlippage'
      );
    });
  });
});
