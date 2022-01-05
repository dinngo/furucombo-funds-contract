import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  Comptroller,
  ShareModuleMock,
  SimpleToken,
  ShareToken,
} from '../typechain';
import { DS_PROXY_REGISTRY } from './utils/constants';

describe('Share module', function () {
  let comptroller: Comptroller;
  let shareModule: ShareModuleMock;
  let shareToken: ShareToken;
  let user1: Wallet;
  let user2: Wallet;
  let tokenD: SimpleToken;
  let vault: any;
  const purchaseAmount = ethers.utils.parseEther('100');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user1, user2] = await (ethers as any).getSigners();
      shareModule = await (await ethers.getContractFactory('ShareModuleMock'))
        .connect(user1)
        .deploy(DS_PROXY_REGISTRY);
      await shareModule.deployed();
      comptroller = await (
        await ethers.getContractFactory('Comptroller')
      ).deploy(
        shareModule.address,
        constants.AddressZero,
        constants.AddressZero
      );
      await comptroller.deployed();
      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user1)
        .deploy();
      await tokenD.deployed();
      // initialize
      await shareModule.setComptroller(comptroller.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await shareModule.setDenomination(tokenD.address);
      await shareModule.setShare();
      await shareModule.setDSProxy();
      await shareModule.setDSProxyApproval(tokenD.address);
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
    it('should fail when not executing or redemption pending', async function () {
      await expect(shareModule.purchase(purchaseAmount)).to.be.revertedWith(
        'InvalidState(0)'
      );
    });

    it('should succeed when executing', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareModule, 'Purchased')
        .withArgs(purchaseAmount, purchaseAmount);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(3);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareModule, 'Purchased')
        .withArgs(purchaseAmount, purchaseAmount);
    });

    it('should transfer denomination token from user to vault', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(tokenD, 'Transfer')
        .withArgs(user1.address, vault, purchaseAmount);
    });

    it('should mint share token to user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user1.address, purchaseAmount);
    });

    it('should call before and after purchase', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(purchaseAmount))
        .to.emit(shareModule, 'BeforePurchaseCalled')
        .to.emit(shareModule, 'AfterPurchaseCalled');
    });
  });

  describe('Redeem', function () {
    const partialRedeem = ethers.utils.parseEther('80');

    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(purchaseAmount);
      await shareModule.setReserve(purchaseAmount);
      await shareModule.setTotalAssetValue(purchaseAmount);
    });

    it('should fail when liquidating', async function () {
      await shareModule.setState(4);
      await expect(shareModule.redeem(purchaseAmount)).to.be.revertedWith(
        'InvalidState(4)'
      );
    });

    it('should succeed when executing with sufficient reserve', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(purchaseAmount, purchaseAmount);
    });

    it('should succeed when executing with insufficient reserve', async function () {
      const remain = purchaseAmount.sub(partialRedeem);
      await shareModule.setState(2);
      await shareModule.setReserve(partialRedeem);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(partialRedeem, partialRedeem)
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(remain);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(3);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(purchaseAmount);
    });

    it('should succeed when closed', async function () {
      await shareModule.setState(5);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(purchaseAmount, purchaseAmount);
    });

    it('should transfer denomination token from vault to user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(tokenD, 'Transfer')
        .withArgs(vault, user1.address, purchaseAmount);
    });

    it('should burn share token from user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, constants.AddressZero, purchaseAmount);
    });

    it('should call before and after redeem', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(purchaseAmount))
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });
  });

  describe('Pending redemption', function () {
    const pendingAmount = ethers.utils.parseEther('20');
    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(purchaseAmount);
      await shareModule.setReserve(purchaseAmount.sub(pendingAmount));
      await shareModule.setTotalAssetValue(purchaseAmount);
      await shareModule.redeem(purchaseAmount);
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAmount);
    });

    it('should succeed when sufficient reserve', async function () {
      await shareModule.setReserve(pendingAmount);
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(pendingAmount, pendingAmount);
    });

    it('should fail when insufficient reserve', async function () {
      await expect(shareModule.settlePendingRedemption()).to.be.revertedWith(
        'Can only left while Executing'
      );
    });

    it('should call before and after redeem', async function () {
      await shareModule.setReserve(pendingAmount);
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });
  });

  describe('Claim pending redemption', function () {
    const pendingAmount = ethers.utils.parseEther('20');
    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(purchaseAmount);
      await shareModule.setReserve(purchaseAmount.sub(pendingAmount));
      await shareModule.setTotalAssetValue(purchaseAmount);
    });

    it('should success when claiming the redemption', async function () {
      await shareModule.redeem(purchaseAmount);
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAmount);
      await shareModule.setReserve(pendingAmount);
      await shareModule.settlePendingRedemption();
      await expect(shareModule.claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(pendingAmount)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, pendingAmount);
    });

    it('should success when claiming with difference user', async function () {
      // Transfer part of the share to user 2
      const amount = pendingAmount.div(2);
      await shareToken.transfer(user2.address, amount);
      // User 1 redeem
      await shareModule.redeem(purchaseAmount.sub(amount));
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAmount);
      // User 2 redeem
      await shareModule.connect(user2).redeem(amount);
      // Top up pool
      await shareModule.setReserve(pendingAmount);
      await shareModule.settlePendingRedemption();
      // User 1 claim
      await expect(shareModule.connect(user1).claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(amount)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, amount);
      // User 2 claim
      await expect(shareModule.connect(user2).claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(amount)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user2.address, amount);
    });
  });
});
