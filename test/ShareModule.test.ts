import { BigNumber, constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  ShareModuleMock,
  SimpleToken,
  ShareToken,
} from '../typechain';
import { FEE_BASE, DS_PROXY_REGISTRY, POOL_STATE } from './utils/constants';
import { ether } from './utils/utils';

describe('Share module', function () {
  let comptroller: ComptrollerImplementation;
  let shareModule: ShareModuleMock;
  let shareToken: ShareToken;
  let user1: Wallet;
  let user2: Wallet;
  let tokenD: SimpleToken;
  let vault: any;

  const totalAsset = ether('100');
  const totalShare = totalAsset;
  const acceptPending = false;
  const penalty = 100;
  const penaltyBase = FEE_BASE;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture('');
      [user1, user2] = await (ethers as any).getSigners();
      shareModule = await (await ethers.getContractFactory('ShareModuleMock'))
        .connect(user1)
        .deploy(DS_PROXY_REGISTRY);
      await shareModule.deployed();

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).deploy();
      await comptroller.deployed();
      await comptroller.initialize(
        shareModule.address,
        constants.AddressZero,
        constants.AddressZero,
        constants.Zero,
        constants.AddressZero,
        constants.Zero,
        constants.AddressZero,
        constants.Zero
      );
      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user1)
        .deploy();
      await tokenD.deployed();
      // initialize
      await shareModule.setComptroller(comptroller.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await shareModule.setDenomination(tokenD.address);
      await shareModule.setShare();
      await shareModule.setVault();
      await shareModule.setVaultApproval();
      const token = await shareModule.shareToken();
      shareToken = await (
        await ethers.getContractFactory('ShareToken')
      ).attach(token);
      vault = await shareModule.vault();
    }
  );

  beforeEach(async function () {
    await setupTest();
    await tokenD.approve(shareModule.address, constants.MaxUint256);
    await shareModule.setPendingRedemptionPenalty(penalty);
  });

  describe('Purchase', function () {
    it('should fail when initializing', async function () {
      await shareModule.setState(POOL_STATE.INITIALIZING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith(
        'InvalidState(0)'
      );
    });

    it('should fail when reviewing', async function () {
      await shareModule.setState(POOL_STATE.REVIEWING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith(
        'InvalidState(1)'
      );
    });

    it('should succeed when executing', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(user1.address, totalAsset, totalShare, 0);

      // Verify
      expect(
        userTokenDBalance.sub(await tokenD.balanceOf(user1.address))
      ).to.be.eq(totalAsset);
      expect(
        (await shareToken.balanceOf(user1.address)).sub(userShareBalance)
      ).to.be.eq(totalAsset);
    });

    it('should succeed when redemption pending', async function () {
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(user1.address, totalAsset, totalShare, 0);

      // Verify
      expect(
        userTokenDBalance.sub(await tokenD.balanceOf(user1.address))
      ).to.be.eq(totalAsset);
      expect(
        (await shareToken.balanceOf(user1.address)).sub(userShareBalance)
      ).to.be.eq(totalAsset);
    });

    it('should fail when liquidating', async function () {
      await shareModule.setState(POOL_STATE.LIQUIDATING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith(
        'InvalidState(4)'
      );
    });

    it('should fail when closed', async function () {
      await shareModule.setState(POOL_STATE.CLOSED);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith(
        'InvalidState(5)'
      );
    });

    it('should transfer denomination token from user to vault', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const vaultTokenDBalance = await tokenD.balanceOf(vault);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(tokenD, 'Transfer')
        .withArgs(user1.address, vault, totalAsset);

      // Verify
      expect(
        userTokenDBalance.sub(await tokenD.balanceOf(user1.address))
      ).to.be.eq(totalAsset);
      expect((await tokenD.balanceOf(vault)).sub(vaultTokenDBalance)).to.be.eq(
        totalAsset
      );
    });

    it('should mint share token to user', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user1.address, totalShare);

      // Verify
      expect(
        (await shareToken.balanceOf(user1.address)).sub(userShareBalance)
      ).to.be.eq(totalAsset);
    });

    it('should call before and after purchase', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'BeforePurchaseCalled')
        .to.emit(shareModule, 'AfterPurchaseCalled');
    });
  });

  describe('Redeem', function () {
    let userShareBefore: BigNumber;
    const partialShare = ether('80');
    const partialAsset = ether('80');

    beforeEach(async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset);
      await shareModule.setGrossAssetValue(totalAsset);
      userShareBefore = await shareToken.balanceOf(user1.address);
    });

    it('should fail when initializing', async function () {
      await shareModule.setState(POOL_STATE.INITIALIZING);
      await expect(
        shareModule.redeem(totalShare, acceptPending)
      ).to.be.revertedWith('InvalidState(0)');
    });

    it('should fail when reviewing', async function () {
      await shareModule.setState(POOL_STATE.REVIEWING);
      await expect(
        shareModule.redeem(totalShare, acceptPending)
      ).to.be.revertedWith('InvalidState(1)');
    });

    it('should succeed with sufficient reserve', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, totalAsset, totalShare);

      // Verify
      expect(
        (await tokenD.balanceOf(user1.address)).sub(userTokenDBalance)
      ).to.be.eq(totalAsset);
    });

    it('should fail with insufficient share', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await expect(
        shareModule.redeem(totalShare.mul(2), acceptPending)
      ).to.be.revertedWith('revertCode(74)'); // SHARE_MODULE_INSUFFICIENT_SHARES
    });

    it('should succeed with insufficient reserve with user permission', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const pendingShare = totalShare.sub(partialShare);
      const actualShare = pendingShare
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const penaltyShare = pendingShare.sub(actualShare);
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.setReserve(partialAsset);

      // Test partial redeem and partial pending redeem
      const receipt = await shareModule.redeem(totalShare, acceptPending);
      expect(receipt)
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, partialAsset, partialShare)
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user1.address, actualShare, penaltyShare)
        .to.emit(shareModule, 'StateTransited')
        .withArgs(POOL_STATE.REDEMPTION_PENDING);

      // Verify
      const block = await ethers.provider.getBlock(receipt.blockNumber!);
      expect(await shareModule.pendingStartTime()).to.be.eq(block.timestamp);
      expect(
        userShareBefore.sub(await shareToken.balanceOf(user1.address))
      ).to.be.eq(totalShare);

      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShares).to.be.eq(actualShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(
        actualShare
      );
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(
        penaltyShare
      );
    });

    it('should revert: user pending round and current pending round are inconsistent', async function () {
      const acceptPending = true;
      const currentPendingRound = await shareModule.currentPendingRound();
      console.log('currentPendingRound', currentPendingRound.toString());
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);
      await shareModule.setReserve(partialAsset);
      await shareModule.setPendingUserPendingInfo(
        user1.address,
        currentPendingRound.add(BigNumber.from(1)),
        ether('1')
      );
      await expect(
        shareModule.redeem(totalShare, acceptPending)
      ).to.be.revertedWith('revertCode(78)'); // SHARE_MODULE_PENDING_ROUND_INCONSISTENT
    });

    it('should fail with insufficient reserve without user permission', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.setReserve(partialAsset);
      await expect(
        shareModule.redeem(totalShare, acceptPending)
      ).to.be.revertedWith('revertCode(70)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
    });

    it('should succeed when redemption pending with user permission', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const actualShare = totalShare
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const penaltyShare = totalShare.sub(actualShare);
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);

      // Test pending redeem at the begin
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify
      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShares).to.be.eq(actualShare);

      expect(
        userShareBefore.sub(await shareToken.balanceOf(user1.address))
      ).to.be.eq(totalShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(
        actualShare
      );
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(
        penaltyShare
      );
    });

    it('should succeed when redemption pending by single user twice', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const redemptionShares = totalShare.div(2);

      const actualShare = redemptionShares
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const penaltyShare = redemptionShares.sub(actualShare);
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);

      // Executes redeem() in round1
      await expect(shareModule.redeem(redemptionShares, acceptPending))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify in round1
      let pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShares).to.be.eq(actualShare);

      // Executes redeem() in round2
      await expect(shareModule.redeem(redemptionShares, acceptPending))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify in round2
      pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShares).to.be.eq(actualShare.add(actualShare));

      expect(await shareModule.currentTotalPendingShare()).to.be.eq(
        actualShare.add(actualShare)
      );
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(
        penaltyShare.add(penaltyShare)
      );
    });

    it('should succeed when redemption pending by multiple users', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const redemptionShares = totalShare.div(2);

      const actualShare = redemptionShares
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const penaltyShare = redemptionShares.sub(actualShare);
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);

      // User1 redeem
      await expect(shareModule.redeem(redemptionShares, acceptPending))
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // User2 redeem
      await shareToken.connect(user1).transfer(user2.address, redemptionShares);
      await expect(
        shareModule.connect(user2).redeem(redemptionShares, acceptPending)
      )
        .to.emit(shareModule, 'RedemptionPended')
        .withArgs(user2.address, actualShare, penaltyShare);

      // Verify
      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser1.pendingShares).to.be.eq(actualShare);

      const pendingUser2 = await shareModule.pendingUsers(user2.address);
      expect(pendingUser2.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser2.pendingShares).to.be.eq(actualShare);

      // verify global information
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(
        pendingUser1.pendingShares.add(pendingUser2.pendingShares)
      );
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(
        penaltyShare.add(penaltyShare)
      );
    });

    it('should fail when redemption pending without user permission', async function () {
      await shareModule.setState(POOL_STATE.REDEMPTION_PENDING);
      await expect(
        shareModule.redeem(totalAsset, acceptPending)
      ).to.be.revertedWith('revertCode(70)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
    });

    it('should fail when liquidating', async function () {
      await shareModule.setState(POOL_STATE.LIQUIDATING);
      await expect(
        shareModule.redeem(totalShare, acceptPending)
      ).to.be.revertedWith('InvalidState(4)');
    });

    it('should succeed when closed', async function () {
      await shareModule.setState(POOL_STATE.CLOSED);
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, totalAsset, totalShare);
    });

    it('should transfer denomination token from vault to user', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const user1TokenDBalance = await tokenD.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(tokenD, 'Transfer')
        .withArgs(vault, user1.address, totalAsset);

      // Verify
      expect(
        (await tokenD.balanceOf(user1.address)).sub(user1TokenDBalance)
      ).to.be.eq(totalAsset);
    });

    it('should burn share token from user', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      const user1ShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, constants.AddressZero, totalShare);

      // Verify
      expect(
        user1ShareBalance.sub(await shareToken.balanceOf(user1.address))
      ).to.be.eq(totalShare);
    });

    it('should call before and after redeem', async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await expect(shareModule.redeem(totalShare, acceptPending))
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });
  });

  describe('Pending redemption', function () {
    const pendingShare = ether('20');
    const pendingAsset = pendingShare;
    const actualShare = pendingShare
      .mul(penaltyBase - penalty)
      .div(penaltyBase);
    const actualAsset = actualShare;
    const bonus = pendingShare.mul(penalty).div(penaltyBase);
    const acceptPending = true;

    beforeEach(async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setGrossAssetValue(totalAsset);
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      expect(
        (await shareModule.pendingUsers(user1.address)).pendingShares
      ).to.be.eq(actualShare);
    });

    it('should succeed when sufficient reserve', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      await shareModule.setReserve(pendingShare);
      const proxyShareBalance = await shareToken.balanceOf(shareModule.address);

      // Execute
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'RedemptionPendingSettled');

      // Verify
      const pendRoundInfo = await shareModule.pendingRoundList(pendingRound);

      // actualShare + bonus
      expect(
        proxyShareBalance.sub(await shareToken.balanceOf(shareModule.address))
      ).to.be.eq(pendingShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);
      expect(pendRoundInfo.totalPendingShare).to.be.eq(actualShare);
      expect(pendRoundInfo.totalRedemption).to.be.eq(actualAsset);
    });

    it('pending twice: pending -> settle -> pending -> settle', async function () {
      // settle in round1
      const pendingRound1 = await shareModule.currentPendingRound();
      await shareModule.setReserve(pendingShare);
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'RedemptionPendingSettled');

      // Verify  of round1
      const pendRound1Info = await shareModule.pendingRoundList(pendingRound1);
      expect(pendRound1Info.totalPendingShare).to.be.eq(actualShare);
      expect(pendRound1Info.totalRedemption).to.be.eq(actualAsset);

      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShares).to.be.eq(actualShare);
      expect(pendingUser1.pendingRound).to.be.eq(pendingRound1);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);

      // Prepare round2
      await tokenD.connect(user1).transfer(user2.address, totalShare);
      await tokenD
        .connect(user2)
        .approve(shareModule.address, constants.MaxUint256);
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.connect(user2).purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setGrossAssetValue(totalAsset);
      await shareModule.connect(user2).redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingShare);

      // Settle in round2
      const pendingRound2 = await shareModule.currentPendingRound();
      await expect(shareModule.settlePendingRedemption())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'RedemptionPendingSettled');

      // Verify in round2
      const pendRound2Info = await shareModule.pendingRoundList(pendingRound2);
      expect(pendingRound1).to.be.not.eq(pendingRound2);
      expect(pendRound2Info.totalPendingShare).to.be.eq(actualShare);
      expect(pendRound2Info.totalRedemption).to.be.eq(actualAsset);

      const pendingUser2 = await shareModule.pendingUsers(user2.address);
      expect(pendingUser2.pendingShares).to.be.eq(actualShare);
      expect(pendingUser2.pendingRound).to.be.eq(pendingRound2);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);
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
        .withArgs(shareModule.address, pendingAsset, pendingShare);
    });

    describe('purchase', function () {
      it('should receive bonus when purchasing', async function () {
        const purchaseAsset = actualAsset;
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(user1.address, purchaseAsset, pendingShare, bonus);
      });

      it('should partially receive bonus when purchasing over amount', async function () {
        const purchaseAsset = actualAsset.mul(2);
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(
            user1.address,
            purchaseAsset,
            pendingShare.add(actualShare),
            bonus
          );
      });
    });

    it('should settle the remain bonus when settle without penalty', async function () {
      const purchaseAsset = actualAsset.div(2);
      await shareModule.purchase(purchaseAsset);
      await shareModule.setGrossAssetValue(pendingAsset.add(purchaseAsset));
      await shareModule.setReserve(pendingAsset);
      const pendingRound = await shareModule.currentPendingRound();

      // Execute
      await expect(shareModule.settlePendingRedemptionWithoutPenalty())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(
          shareModule.address,
          actualAsset.add(bonus.div(2)),
          actualShare.add(bonus.div(2))
        );

      // Verify
      const pendRoundInfo = await shareModule.pendingRoundList(pendingRound);
      expect(pendRoundInfo.totalPendingShare).to.be.eq(actualShare);
      expect(pendRoundInfo.totalRedemption).to.be.eq(
        actualAsset.add(bonus.div(2))
      );

      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingShares).to.be.eq(actualShare);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
    });
  });

  describe('Claim pending redemption', function () {
    const pendingShare = ether('20');
    const pendingAsset = pendingShare;
    const acceptPending = true;

    beforeEach(async function () {
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setGrossAssetValue(totalAsset);
    });

    it('should success when claiming the redemption', async function () {
      const redeemShare = pendingShare;
      const actualShare = redeemShare
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset = actualShare;
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      // Execute
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.claimPendingRedemption(user1.address))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);

      // Verify
      expect(
        (await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)
      ).to.be.eq(actualAsset);

      const pendingShares = (await shareModule.pendingUsers(user1.address))
        .pendingShares;
      expect(pendingShares).to.be.eq(0);
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
      await shareModule.redeem(totalShare.sub(redeemShare), acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);

      // User 2 redeem
      await shareModule.connect(user2).redeem(redeemShare, acceptPending);

      // Top up pool
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      const user2DenominationBefore = await tokenD.balanceOf(user2.address);

      // User 1 claim
      await expect(
        shareModule.connect(user1).claimPendingRedemption(user1.address)
      )
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);

      // User 2 claim
      await expect(
        shareModule.connect(user2).claimPendingRedemption(user2.address)
      )
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user2.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user2.address, actualAsset);

      expect(
        (await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)
      ).to.be.eq(actualAsset);

      expect(
        (await tokenD.balanceOf(user2.address)).sub(user2DenominationBefore)
      ).to.be.eq(actualAsset);

      expect(
        (await shareModule.pendingUsers(user1.address)).pendingShares
      ).to.be.eq(0);

      expect(
        (await shareModule.pendingUsers(user2.address)).pendingShares
      ).to.be.eq(0);
    });

    it('claim pending shares in normal redeem ', async function () {
      // 1st pending round and settle
      const currentPendingRound1 = await shareModule.currentPendingRound();
      const redeemShare1 = pendingShare;
      const actualShare1 = redeemShare1
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset1 = actualShare1;
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      // Verify in round1
      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShares).to.be.eq(actualAsset1);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound1);

      // Prepare redeem in round2
      const purchaseShares = ether('10');
      const purchaseAsset = purchaseShares;
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.purchase(purchaseShares);
      await shareModule.setReserve(purchaseAsset);
      await shareModule.setGrossAssetValue(purchaseAsset);

      // Execute redeem in round2
      const redeemShares = purchaseShares.div('2');
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.redeem(redeemShares, acceptPending))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset1)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset1);

      // Verify in round2
      // Previous pending redemption + redemption in round2
      expect(
        (await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)
      ).to.be.eq(actualAsset1.add(redeemShares));
    });

    it('claim pending shares in pending redeem ', async function () {
      //  settle in round1
      const currentPendingRound1 = await shareModule.currentPendingRound();
      const redeemShare1 = pendingShare;
      const actualShare1 = redeemShare1
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset1 = actualShare1;
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      // Verify in round1
      let pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShares).to.be.eq(actualAsset1);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound1);

      // Prepare round2
      const totalAsset2 = totalAsset.mul(2);
      const totalShares2 = totalAsset2;
      const pendingShare2 = pendingShare.mul(2);
      const currentPendingRound2 = await shareModule.currentPendingRound();
      const redeemShare2 = pendingShare2;
      const actualShare2 = redeemShare2
        .mul(penaltyBase - penalty)
        .div(penaltyBase);
      const actualAsset2 = actualShare2;
      const round2Reserve = totalAsset2.sub(pendingShare2);
      await shareModule.setState(POOL_STATE.EXECUTING);
      await shareModule.purchase(totalAsset2);
      await shareModule.setReserve(round2Reserve);
      await shareModule.setGrossAssetValue(totalAsset2);

      // Execute redeem in round2
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.redeem(totalShares2, acceptPending))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset1)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset1);

      // Verify
      // Previous pending redemption + partial redemption without pending round2
      expect(
        (await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)
      ).to.be.eq(actualAsset1.add(round2Reserve));

      // check user1 pending info
      pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShares).to.be.eq(actualAsset2);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound2);
    });

    it('should revert: pending round is not settle yet', async function () {
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await expect(
        shareModule.claimPendingRedemption(user1.address)
      ).to.be.revertedWith('revertCode(77)'); // SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });

    it('should success when claiming the redemption', async function () {
      await shareModule.redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingRedemption();

      await expect(
        shareModule.connect(user2).claimPendingRedemption(user2.address)
      ).to.be.revertedWith('revertCode(77)'); // SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
  });
});
