import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { ShareModuleMock, SimpleToken, ShareToken } from '../typechain';
import { DS_PROXY_REGISTRY } from './utils/constants';

describe('Share module', function () {
  let shareModule: ShareModuleMock;
  let shareToken: ShareToken;
  let user: Wallet;
  let tokenD: SimpleToken;
  let vault: any;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user] = await (ethers as any).getSigners();
      shareModule = await (
        await ethers.getContractFactory('ShareModuleMock')
      ).deploy(DS_PROXY_REGISTRY);
      await shareModule.deployed();
      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();
      // initialize
      await shareModule.setDenomination(tokenD.address);
      await shareModule.setShare();
      await shareModule.setDSProxy();
      const token = await shareModule.callStatic.shareToken();
      shareToken = await (
        await ethers.getContractFactory('ShareToken')
      ).attach(token);
      vault = await shareModule.callStatic.vault();
    }
  );

  beforeEach(async function () {
    await setupTest();
    await tokenD.approve(shareModule.address, constants.MaxUint256);
  });

  describe('Purchase', function () {
    const purchaseAmount = 100;

    it('should fail when not executing or redemption pending', async function () {
      await expect(shareModule.purchase(purchaseAmount)).to.be.revertedWith(
        'InvalidState(0)'
      );
    });

    it('should succeed when executing', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user.address, purchaseAmount)
        .to.emit(tokenD, 'Transfer')
        .withArgs(user.address, vault, purchaseAmount);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(3);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user.address, purchaseAmount)
        .to.emit(tokenD, 'Transfer')
        .withArgs(user.address, vault, purchaseAmount);
    });
  });
});
