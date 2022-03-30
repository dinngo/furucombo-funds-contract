import { Wallet, BigNumber, Signer } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  IERC20,
  FurucomboRegistry,
  IATokenV2,
  SimpleToken,
  ILendingPoolV2,
  HAaveProtocolV2,
  FurucomboProxyMock,
  IVariableDebtToken,
} from '../../typechain';

import {
  DAI_TOKEN,
  WMATIC_TOKEN,
  ADAI_V2_TOKEN,
  AAVE_RATEMODE,
  AWMATIC_V2_DEBT_VARIABLE,
  AAVEPROTOCOL_V2_PROVIDER,
} from './../utils/constants';

import {
  ether,
  profileGas,
  simpleEncode,
  asciiToHex32,
  tokenProviderQuick,
  expectEqWithinBps,
  getHandlerReturn,
  balanceDelta,
} from './../utils/utils';

describe('Aave V2 Repay', function () {
  const aTokenAddress = ADAI_V2_TOKEN;
  const tokenAddress = DAI_TOKEN;

  let owner: Wallet;
  let user: Wallet;
  let someone: Wallet;

  let token: IERC20;
  let borrowToken: IERC20;
  let aToken: IATokenV2;
  let mockToken: SimpleToken;
  let providerAddress: Signer;
  let debtToken: IERC20;

  let proxy: FurucomboProxyMock;
  let registry: FurucomboRegistry;
  let hAaveV2: HAaveProtocolV2;
  let lendingPool: ILendingPoolV2;

  let userBalance: BigNumber;
  let proxyBalance: BigNumber;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [owner, user, someone] = await (ethers as any).getSigners();

    // Setup token and unlock provider
    providerAddress = await tokenProviderQuick(tokenAddress);
    token = await ethers.getContractAt('IERC20', tokenAddress);
    aToken = await ethers.getContractAt('IATokenV2', aTokenAddress);
    mockToken = await (await ethers.getContractFactory('SimpleToken')).deploy();
    await mockToken.deployed();

    // Setup proxy and Aproxy
    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();

    proxy = await (await ethers.getContractFactory('FurucomboProxyMock')).deploy(registry.address);
    await proxy.deployed();

    hAaveV2 = await (await ethers.getContractFactory('HAaveProtocolV2')).deploy();
    await hAaveV2.deployed();
    await registry.register(hAaveV2.address, asciiToHex32('HAaveProtocolV2'));

    const provider = await ethers.getContractAt('ILendingPoolAddressesProviderV2', AAVEPROTOCOL_V2_PROVIDER);

    lendingPool = await ethers.getContractAt('ILendingPoolV2', await provider.getLendingPool());
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('Repay Variable Rate', function () {
    let borrowTokenProvider: Signer;
    let depositAmount = ether('10000');
    const borrowAmount = ether('2');
    const borrowTokenAddr = WMATIC_TOKEN;
    const rateMode = AAVE_RATEMODE.VARIABLE;
    const debtTokenAddr = AWMATIC_V2_DEBT_VARIABLE;

    beforeEach(async function () {
      borrowTokenProvider = await tokenProviderQuick(borrowTokenAddr);
      token = await ethers.getContractAt('IERC20', tokenAddress);

      borrowToken = await ethers.getContractAt('IERC20', borrowTokenAddr);
      debtToken = await ethers.getContractAt('IERC20', debtTokenAddr);

      // Deposit
      await token.connect(providerAddress).approve(lendingPool.address, depositAmount);
      await lendingPool.connect(providerAddress).deposit(token.address, depositAmount, user.address, 0);
      depositAmount = await aToken.balanceOf(user.address);

      // Borrow
      await lendingPool.connect(user).borrow(borrowToken.address, borrowAmount, rateMode, 0, user.address);

      expect(await borrowToken.balanceOf(user.address)).to.be.eq(borrowAmount);
      expectEqWithinBps(await debtToken.balanceOf(user.address), borrowAmount, 100);
    });

    it('partial', async function () {
      const value = borrowAmount.div(BigNumber.from('2'));
      const to = hAaveV2.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      // const debtTokenUserBefore = await debtToken.balanceOf(user.address);
      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      // (borrowAmount - repayAmount -1) <= remainBorrowAmount < (borrowAmount + interestMax - repayAmount)
      // NOTE: handlerReturn == (borrowAmount - repayAmount -1) (sometime, Ganache bug maybe)
      expect(handlerReturn).to.be.gte(borrowAmount.sub(value.add(BigNumber.from(1))));
      expect(handlerReturn).to.be.lt(borrowAmount.sub(value).add(interestMax));
      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);
      // Verify user balance
      // (borrow - repay) <= debtTokenUserAfter < (borrow + interestMax - repay)
      expect(debtTokenUserAfter).to.be.gte(borrowAmount.sub(value));
      expect(debtTokenUserAfter).to.be.lt(borrowAmount.add(interestMax).sub(value));
      expect(borrowTokenUserAfter).to.be.eq(borrowAmount.sub(value));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('whole', async function () {
      const extraNeed = ether('1');
      const value = borrowAmount.add(extraNeed);
      const to = hAaveV2.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, rateMode]);
      await borrowToken.connect(borrowTokenProvider).transfer(user.address, extraNeed);
      await borrowToken.connect(user).transfer(proxy.address, value);
      await proxy.updateTokenMock(borrowToken.address);
      userBalance = await ethers.provider.getBalance(user.address);

      const receipt = await proxy.connect(user).execMock(to, data, {
        value: ether('0.1'),
      });

      // Get handler return result
      const handlerReturn = (await getHandlerReturn(receipt, ['uint256']))[0];
      const borrowTokenUserAfter = await borrowToken.balanceOf(user.address);
      const debtTokenUserAfter = await debtToken.balanceOf(user.address);
      const interestMax = borrowAmount.mul(BigNumber.from(1)).div(BigNumber.from(10000));

      // Verify handler return
      expect(handlerReturn).to.be.eq(0);
      // Verify proxy balance
      expect(await borrowToken.balanceOf(proxy.address)).to.be.eq(0);
      // Verify user balance
      expect(debtTokenUserAfter).to.be.eq(0);
      // (repay - borrow - interestMax) < borrowTokenUserAfter <= (repay - borrow)
      expect(borrowTokenUserAfter).to.be.lte(value.sub(borrowAmount));
      expect(borrowTokenUserAfter).to.be.gt(value.sub(borrowAmount).sub(interestMax));
      expect(await balanceDelta(user.address, userBalance)).to.be.eq(ether('0'));
      await profileGas(receipt);
    });

    it('should revert: not enough balance', async function () {
      const value = ether('0.5');
      const to = hAaveV2.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, rateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value.sub(ether('0.1')));
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith(
        'HAaveProtocolV2_repay: SafeERC20: low-level call failed'
      );
    });

    it('should revert: not supported token', async function () {
      const value = ether('0.5');
      const to = hAaveV2.address;
      const data = simpleEncode('repay(address,uint256,uint256)', [mockToken.address, value, rateMode]);
      await mockToken.connect(owner).transfer(proxy.address, value);
      await proxy.updateTokenMock(mockToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV2_repay: Unspecified');
    });

    it('should revert: wrong rate mode', async function () {
      const value = ether('0.5');
      const to = hAaveV2.address;
      const unborrowedRateMode = (rateMode % 2) + 1;
      const data = simpleEncode('repay(address,uint256,uint256)', [borrowToken.address, value, unborrowedRateMode]);
      await borrowToken.connect(user).transfer(proxy.address, value);
      await proxy.updateTokenMock(borrowToken.address);

      await expect(proxy.connect(user).execMock(to, data)).to.be.revertedWith('HAaveProtocolV2_repay: 15');
    });
  });
});
