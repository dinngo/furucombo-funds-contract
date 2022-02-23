import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  FurucomboProxyMock,
  Registry,
  HAaveProtocolV2,
  IERC20,
  HFunds,
  ILendingPoolV2,
  IWMATIC,
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
  AAVE_RATEMODE,
  AAVEPROTOCOL_V2_PROVIDER,
} from '../utils/constants';
import {
  ether,
  simpleEncode,
  asciiToHex32,
  padRightZero,
  balanceDelta,
} from '../utils/utils';

describe('CubeCounting', function () {
  let owner: Wallet;
  let user: Wallet;

  let proxy: FurucomboProxyMock;
  let registry: Registry;
  let hAaveV2: HAaveProtocolV2;
  let hFunds: HFunds;
  let lendingPool: ILendingPoolV2;

  let tokenA: IERC20;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user] = await (ethers as any).getSigners();

      // Setup token
      tokenA = await ethers.getContractAt('IERC20', WMATIC_TOKEN);

      // Setup proxy and Aproxy
      registry = await (await ethers.getContractFactory('Registry')).deploy();
      await registry.deployed();

      proxy = await (
        await ethers.getContractFactory('FurucomboProxyMock')
      ).deploy(registry.address);
      await proxy.deployed();

      // Deploy handler and register
      hAaveV2 = await (
        await ethers.getContractFactory('HAaveProtocolV2')
      ).deploy();
      await hAaveV2.deployed();
      await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

      hFunds = await (await ethers.getContractFactory('HFunds')).deploy();
      await hFunds.deployed();
      await registry.register(hFunds.address, asciiToHex32('HFunds'));

      // Register Aave caller
      const provider = await ethers.getContractAt(
        'ILendingPoolAddressesProviderV2',
        AAVEPROTOCOL_V2_PROVIDER
      );

      lendingPool = await ethers.getContractAt(
        'ILendingPoolV2',
        await provider.getLendingPool()
      );
      await registry.registerCaller(
        lendingPool.address,
        padRightZero(hAaveV2.address, 24)
      );
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('FlashLoan', function () {
    it('should revert: invalid callback data', async function () {
      // FlashLoan with invalid callback data
      const value = ether('1');
      const to = hAaveV2.address;

      // Prepare data
      const flashloanParams = ethers.utils.defaultAbiCoder.encode(
        ['address[]', 'bytes32[]', 'bytes[]'],
        [[], [], []]
      );

      const flashloanCubeData = simpleEncode(
        'flashLoan(address[],uint256[],uint256[],bytes)',
        [
          [tokenA.address],
          [ether('10')],
          [AAVE_RATEMODE.NODEBT],
          flashloanParams,
        ]
      );

      await expect(
        proxy.connect(user).execMock(to, flashloanCubeData)
      ).to.be.revertedWith('0_HAaveProtocolV2_flashLoan');
    });
  });

  it('should revert: 0 -> 0', async function () {
    const to = hAaveV2.address;

    // Prepare data
    const data = [
      simpleEncode('checkSlippage(address[],uint256[])', [
        [tokenA.address],
        [],
      ]),
    ];
    const flashloanParams = ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'bytes32[]', 'bytes[]'],
      [[hFunds.address], [constants.HashZero], data]
    );

    const flashloanCubeData = simpleEncode(
      'flashLoan(address[],uint256[],uint256[],bytes)',
      [[tokenA.address], [ether('10')], [AAVE_RATEMODE.NODEBT], flashloanParams]
    );

    await expect(
      proxy.connect(user).execMock(to, flashloanCubeData)
    ).to.be.revertedWith('0_HAaveProtocolV2_flashLoan: 0_HFunds_checkSlippage');
  });
});
