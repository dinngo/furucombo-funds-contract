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
  const totalAsset = ethers.utils.parseEther('100');
  const totalShare = totalAsset;

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
        constants.AddressZero,
        constants.Zero,
        constants.AddressZero,
        constants.Zero,
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
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith(
        'InvalidState(0)'
      );
    });

    it('should succeed when executing', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(totalAsset, totalShare);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(3);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(totalAsset, totalShare);
    });

    it('should transfer denomination token from user to vault', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(tokenD, 'Transfer')
        .withArgs(user1.address, vault, totalAsset);
    });

    it('should mint share token to user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user1.address, totalShare);
    });

    it('should call before and after purchase', async function () {
      await shareModule.setState(2);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'BeforePurchaseCalled')
        .to.emit(shareModule, 'AfterPurchaseCalled');
    });
  });

  describe('Redeem', function () {
    const partialShare = ethers.utils.parseEther('80');
    const partialAsset = ethers.utils.parseEther('80');

    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset);
      await shareModule.setTotalAssetValue(totalAsset);
    });

    it('should fail when liquidating', async function () {
      await shareModule.setState(4);
      await expect(shareModule.redeem(totalShare)).to.be.revertedWith(
        'InvalidState(4)'
      );
    });

    it('should succeed when executing with sufficient reserve', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(totalShare))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(totalAsset, totalShare);
    });

    it('should succeed when executing with insufficient reserve', async function () {
      const remainShare = totalShare.sub(partialShare);
      await shareModule.setState(2);
      await shareModule.setReserve(partialAsset);
      const receipt = await shareModule.redeem(totalShare);
      expect(receipt)
        .to.emit(shareModule, 'Redeemed')
        .withArgs(partialAsset, partialShare)
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(remainShare)
        .to.emit(shareModule, 'StateTransited')
        .withArgs(3);
      const block = await ethers.provider.getBlock(receipt.blockNumber!);
      expect(await shareModule.pendingStartTime()).to.be.eq(block.timestamp);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(3);
      await expect(shareModule.redeem(totalAsset))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(totalShare);
    });

    it('should succeed when closed', async function () {
      await shareModule.setState(5);
      await expect(shareModule.redeem(totalShare))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(totalAsset, totalShare);
    });

    it('should transfer denomination token from vault to user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(totalShare))
        .to.emit(tokenD, 'Transfer')
        .withArgs(vault, user1.address, totalAsset);
    });

    it('should burn share token from user', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(totalShare))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, constants.AddressZero, totalShare);
    });

    it('should call before and after redeem', async function () {
      await shareModule.setState(2);
      await expect(shareModule.redeem(totalShare))
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });
  });

  describe('Pending redemption', function () {
    const pendingShare = ethers.utils.parseEther('20');
    const pendingAsset = pendingShare;
    const penalty = 100;
    const penaltyBase = 10000;
    const actualShare = pendingShare
      .mul(penaltyBase - penalty)
      .div(penaltyBase);
    const actualAsset = actualShare;
    const bonus = pendingShare.mul(penalty).div(penaltyBase);

    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setTotalAssetValue(totalAsset);
      await shareModule.redeem(totalAsset);
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAsset);
    });

    it('should succeed when sufficient reserve', async function () {
      let userAddress: string;
      let share;

      await shareModule.setReserve(pendingShare);
      userAddress = await shareModule.pendingAccountList(0);

      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(actualAsset, actualShare);

      share = await shareModule.pendingShares(userAddress);
      expect(share).to.eq(BigNumber.from('0'));
    });

    it('should fail when insufficient reserve', async function () {
      await expect(shareModule.settlePendingRedemption()).to.be.revertedWith(
        'InvalidState(3)'
      );
    });

    it('should call before and after redeem', async function () {
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });

    it('should settle without penalty in specific usage', async function () {
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingRedemptionWithoutPenalty())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(pendingAsset, pendingShare);
    });

    describe('purchase', function () {
      it('should receive bonus when purchasing', async function () {
        const purchaseAsset = actualAsset;
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(purchaseAsset, pendingShare);
      });

      it('should partially receive bonus when purchasing over amount', async function () {
        const purchaseAsset = actualAsset.mul(2);
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(purchaseAsset, pendingShare.add(actualShare));
      });
    });

    it('should settle the remain bonus when settle without penalty', async function () {
      const purchaseAsset = actualAsset.div(2);
      await shareModule.purchase(purchaseAsset);
      await shareModule.setTotalAssetValue(pendingAsset.add(purchaseAsset));
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingRedemptionWithoutPenalty())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(actualAsset.add(bonus.div(2)), actualShare.add(bonus.div(2)));
    });
  });

  describe('Claim pending redemption', function () {
    const pendingShare = ethers.utils.parseEther('20');
    const pendingAsset = pendingShare;
    const penalty = 100;
    const penaltyBase = 10000;

    beforeEach(async function () {
      await shareModule.setState(2);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setTotalAssetValue(totalAsset);
    });

    it('should success when claiming the redemption', async function () {
      let balance;

      const redeemShare = pendingShare;
      const actualShare = redeemShare
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset = actualShare;
      await shareModule.redeem(totalShare);
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      await expect(shareModule.claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);

      balance = await shareModule.pendingRedemptions(user1.address);
      await expect(balance).to.eq(BigNumber.from('0'));
    });

    it('should success when claiming with difference user', async function () {
      // Transfer part of the share to user 2
      const redeemShare = pendingShare.div(2);
      const actualShare = redeemShare
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset = actualShare;
      await shareToken.transfer(user2.address, redeemShare);
      // User 1 redeem
      await shareModule.redeem(totalAsset.sub(redeemShare));
      await shareModule.setReserve(0);
      await shareModule.setTotalAssetValue(pendingAsset);
      // User 2 redeem
      await shareModule.connect(user2).redeem(redeemShare);
      // Top up pool
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();
      // User 1 claim
      await expect(shareModule.connect(user1).claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);
      // User 2 claim
      await expect(shareModule.connect(user2).claimPendingRedemption())
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user2.address, actualAsset);
    });
  });
});
