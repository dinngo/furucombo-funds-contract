import { BigNumber, constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { network, ethers, deployments } from 'hardhat';
import { ComptrollerImplementation, ShareModuleMock, SimpleToken, ShareToken } from '../typechain';
import { MINIMUM_SHARE, FUND_PERCENTAGE_BASE, DS_PROXY_REGISTRY, FUND_STATE } from './utils/constants';
import { ether } from './utils/utils';

describe('Share module', function () {
  let comptroller: ComptrollerImplementation;
  let shareModule: ShareModuleMock;
  let shareToken: ShareToken;
  let user1: Wallet;
  let user2: Wallet;
  let user3: Wallet;
  let tokenD: SimpleToken;
  let vault: any;

  const totalAsset = ether('100'); // user's asset to purchase
  const totalShare = totalAsset; // total share token supply
  const receivedShare = totalAsset.sub(MINIMUM_SHARE); // user's share from the first purchase
  const receivedAsset = receivedShare; // user's asset from redeem
  const acceptPending = false;
  const penalty = 100;
  const penaltyBase = FUND_PERCENTAGE_BASE;

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [user1, user2, user3] = await (ethers as any).getSigners();
    shareModule = await (await ethers.getContractFactory('ShareModuleMock')).connect(user1).deploy(DS_PROXY_REGISTRY);
    await shareModule.deployed();

    const anyAddress = user3.address;
    const setupAction = await (await ethers.getContractFactory('SetupAction')).deploy();
    await setupAction.deployed();

    comptroller = await (await ethers.getContractFactory('ComptrollerImplementation')).deploy();
    await comptroller.deployed();
    await comptroller.initialize(
      shareModule.address,
      anyAddress,
      anyAddress,
      constants.Zero,
      anyAddress,
      constants.Zero,
      anyAddress,
      constants.Zero,
      DS_PROXY_REGISTRY,
      setupAction.address
    );

    tokenD = await (await ethers.getContractFactory('SimpleToken')).connect(user1).deploy();
    await tokenD.deployed();
    // initialize
    await shareModule.setComptroller(comptroller.address);
    await comptroller.permitDenominations([tokenD.address], [0]);
    await shareModule.setDenomination(tokenD.address);
    await shareModule.setShare();
    await shareModule.setVault();
    await shareModule.setVaultApproval();
    const token = await shareModule.shareToken();
    shareToken = await (await ethers.getContractFactory('ShareToken')).attach(token);
    vault = await shareModule.vault();
  });

  beforeEach(async function () {
    await setupTest();
    await tokenD.approve(shareModule.address, constants.MaxUint256);
    await shareModule.setPendingPenalty(penalty);
  });

  describe('Calculate', function () {
    beforeEach(async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset);
      await shareModule.setGrossAssetValue(totalAsset);
    });

    describe('calculate share by balance', function () {
      it('same value as the total asset', async function () {
        const shareAmount = await shareModule.calculateShare(totalAsset);
        expect(shareAmount).to.be.eq(totalShare);
      });

      it('0 value', async function () {
        const shareAmount = await shareModule.calculateShare(0);
        expect(shareAmount).to.be.eq(0);
      });

      it('less than minimum share', async function () {
        const shareAmount = await shareModule.calculateShare(MINIMUM_SHARE - 1);
        expect(shareAmount).to.be.eq(MINIMUM_SHARE - 1);
      });
    });

    describe('calculate balance by share', function () {
      it('0 share', async function () {
        const shareAmount = 0;
        const balanceAmount = await shareModule.calculateBalance(shareAmount);
        expect(balanceAmount).to.be.eq(0);
      });

      it('half total share', async function () {
        const shareAmount = totalShare.div(2);
        const balanceAmount = await shareModule.calculateBalance(shareAmount);
        expect(balanceAmount).to.be.eq(totalAsset.div(2));
      });

      it('should revert: greater than total share', async function () {
        const shareAmount = totalShare.add(1);
        await expect(shareModule.calculateBalance(shareAmount)).to.be.revertedWith('RevertCode(69)'); // SHARE_MODULE_SHARE_AMOUNT_TOO_LARGE
      });
    });
  });

  describe('Calculate share before the initial purchase', function () {
    beforeEach(async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
    });

    describe('calculate share by balance', function () {
      it('receive less share', async function () {
        const shareAmount = await shareModule.calculateShare(totalAsset);
        expect(shareAmount).to.be.eq(receivedShare);
      });

      it('less than minimum share', async function () {
        const shareAmount = await shareModule.calculateShare(MINIMUM_SHARE - 1);
        expect(shareAmount).to.be.eq(0);
      });
    });
  });

  describe('Purchase', function () {
    it('should revert: when initializing', async function () {
      await shareModule.setState(FUND_STATE.INITIALIZING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith('InvalidState(0)');
    });

    it('should revert: when reviewing', async function () {
      await shareModule.setState(FUND_STATE.REVIEWING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith('InvalidState(1)');
    });

    it('when executing', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(user1.address, totalAsset, receivedShare, 0);

      // Verify
      expect(userTokenDBalance.sub(await tokenD.balanceOf(user1.address))).to.be.eq(totalAsset);
      expect((await shareToken.balanceOf(user1.address)).sub(userShareBalance)).to.be.eq(receivedShare);
      expect(await shareToken.balanceOf(shareToken.address)).to.be.eq(MINIMUM_SHARE); // Lock minimum amount to share token contract
    });

    it('when pending', async function () {
      await shareModule.setState(FUND_STATE.PENDING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'Purchased')
        .withArgs(user1.address, totalAsset, receivedShare, 0);

      // Verify
      expect(userTokenDBalance.sub(await tokenD.balanceOf(user1.address))).to.be.eq(totalAsset);
      expect((await shareToken.balanceOf(user1.address)).sub(userShareBalance)).to.be.eq(receivedShare);
    });

    it('should revert: when liquidating', async function () {
      await shareModule.setState(FUND_STATE.LIQUIDATING);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith('InvalidState(4)');
    });

    it('should revert: when closed', async function () {
      await shareModule.setState(FUND_STATE.CLOSED);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith('InvalidState(5)');
    });

    it('transfer denomination token from user to vault', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);
      const vaultTokenDBalance = await tokenD.balanceOf(vault);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(tokenD, 'Transfer')
        .withArgs(user1.address, vault, totalAsset);

      // Verify
      expect(userTokenDBalance.sub(await tokenD.balanceOf(user1.address))).to.be.eq(totalAsset);
      expect((await tokenD.balanceOf(vault)).sub(vaultTokenDBalance)).to.be.eq(totalAsset);
    });

    it('mint share token to user', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const userShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareToken, 'Transfer')
        .withArgs(constants.AddressZero, user1.address, receivedShare);

      // Verify
      expect((await shareToken.balanceOf(user1.address)).sub(userShareBalance)).to.be.eq(receivedShare);
    });

    it('call before and after purchase', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await expect(shareModule.purchase(totalAsset))
        .to.emit(shareModule, 'BeforePurchaseCalled')
        .to.emit(shareModule, 'AfterPurchaseCalled');
    });

    it('should revert: purchase zero balance', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await expect(shareModule.purchase(0)).to.be.revertedWith('RevertCode(70)'); // SHARE_MODULE_PURCHASE_ZERO_BALANCE
    });

    it('should revert: purchase zero share', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(MINIMUM_SHARE + 1);
      await shareModule.setGrossAssetValue(constants.MaxInt256);
      await expect(shareModule.purchase(totalAsset)).to.be.revertedWith('RevertCode(71)'); // SHARE_MODULE_PURCHASE_ZERO_SHARE
    });
  });

  describe('Redeem', function () {
    let userShareBefore: BigNumber;
    const partialShare = ether('80');
    const partialAsset = ether('80');

    beforeEach(async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(totalAsset);
      await shareModule.setGrossAssetValue(totalAsset);
      userShareBefore = await shareToken.balanceOf(user1.address);
    });

    it('should revert: when initializing', async function () {
      await shareModule.setState(FUND_STATE.INITIALIZING);
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('InvalidState(0)');
    });

    it('should revert: when reviewing', async function () {
      await shareModule.setState(FUND_STATE.REVIEWING);
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('InvalidState(1)');
    });

    it('sufficient reserve', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const userTokenDBalance = await tokenD.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, receivedAsset, receivedShare);

      // Verify
      expect((await tokenD.balanceOf(user1.address)).sub(userTokenDBalance)).to.be.eq(receivedAsset);
    });

    it('should revert: with insufficient share', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await expect(shareModule.redeem(receivedShare.mul(2), acceptPending)).to.be.revertedWith('RevertCode(73)'); // SHARE_MODULE_INSUFFICIENT_SHARE
    });

    it('insufficient reserve with user permission', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const pendingShare = receivedShare.sub(partialShare);
      const actualShare = pendingShare.mul(penaltyBase - penalty).div(penaltyBase);
      const penaltyShare = pendingShare.sub(actualShare);
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.setReserve(partialAsset);

      // Test partial redeem and partial pending redeem
      const receipt = await shareModule.redeem(receivedShare, acceptPending);
      expect(receipt)
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, partialAsset, partialShare)
        .to.emit(shareModule, 'Pended')
        .withArgs(user1.address, actualShare, penaltyShare)
        .to.emit(shareModule, 'StateTransited')
        .withArgs(FUND_STATE.PENDING);

      // Verify
      const block = await ethers.provider.getBlock(receipt.blockNumber!);
      expect(await shareModule.pendingStartTime()).to.be.eq(block.timestamp);
      expect(userShareBefore.sub(await shareToken.balanceOf(user1.address))).to.be.eq(receivedShare);

      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShare).to.be.eq(actualShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(actualShare);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(penaltyShare);
    });

    it('should revert: user pending round and current pending round are inconsistent', async function () {
      const acceptPending = true;
      const currentPendingRound = await shareModule.currentPendingRound();
      await shareModule.setState(FUND_STATE.PENDING);
      await shareModule.setReserve(partialAsset);
      await shareModule.setPendingUserPendingInfo(
        user1.address,
        currentPendingRound.add(BigNumber.from(1)),
        ether('1')
      );
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('RevertCode(75)'); // SHARE_MODULE_PENDING_ROUND_INCONSISTENT
    });

    it('should revert: with insufficient reserve without user permission', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.setReserve(partialAsset);
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('RevertCode(74)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
    });

    it('pending with user permission', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const actualShare = receivedShare.mul(penaltyBase - penalty).div(penaltyBase);
      const penaltyShare = receivedShare.sub(actualShare);
      await shareModule.setState(FUND_STATE.PENDING);

      // Test pending redeem at the begin
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(shareModule, 'Pended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify
      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShare).to.be.eq(actualShare);

      expect(userShareBefore.sub(await shareToken.balanceOf(user1.address))).to.be.eq(receivedShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(actualShare);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(penaltyShare);
    });

    it('pending by single user twice', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const redemptionShare = receivedShare.div(2);

      const actualShare = redemptionShare.mul(penaltyBase - penalty).div(penaltyBase);
      const penaltyShare = redemptionShare.sub(actualShare);
      await shareModule.setState(FUND_STATE.PENDING);

      // Executes redeem() in round1
      await expect(shareModule.redeem(redemptionShare, acceptPending))
        .to.emit(shareModule, 'Pended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify in round1
      let pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShare).to.be.eq(actualShare);

      // Executes redeem() in round2
      await expect(shareModule.redeem(redemptionShare, acceptPending))
        .to.emit(shareModule, 'Pended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // Verify in round2
      pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser.pendingShare).to.be.eq(actualShare.add(actualShare));

      expect(await shareModule.currentTotalPendingShare()).to.be.eq(actualShare.add(actualShare));
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(penaltyShare.add(penaltyShare));
    });

    it('pending by multiple users', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      const acceptPending = true;
      const redemptionShare = receivedShare.div(2);

      const actualShare = redemptionShare.mul(penaltyBase - penalty).div(penaltyBase);
      const penaltyShare = redemptionShare.sub(actualShare);
      await shareModule.setState(FUND_STATE.PENDING);

      // User1 redeem
      await expect(shareModule.redeem(redemptionShare, acceptPending))
        .to.emit(shareModule, 'Pended')
        .withArgs(user1.address, actualShare, penaltyShare);

      // User2 redeem
      await shareToken.connect(user1).transfer(user2.address, redemptionShare);
      await expect(shareModule.connect(user2).redeem(redemptionShare, acceptPending))
        .to.emit(shareModule, 'Pended')
        .withArgs(user2.address, actualShare, penaltyShare);

      // Verify
      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser1.pendingShare).to.be.eq(actualShare);

      const pendingUser2 = await shareModule.pendingUsers(user2.address);
      expect(pendingUser2.pendingRound).to.be.eq(pendingRound);
      expect(pendingUser2.pendingShare).to.be.eq(actualShare);

      // verify global information
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(
        pendingUser1.pendingShare.add(pendingUser2.pendingShare)
      );
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(penaltyShare.add(penaltyShare));
    });

    it('should revert: when pending without user permission', async function () {
      await shareModule.setState(FUND_STATE.PENDING);
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('RevertCode(74)'); // SHARE_MODULE_REDEEM_IN_PENDING_WITHOUT_PERMISSION
    });

    it('should revert: when liquidating', async function () {
      await shareModule.setState(FUND_STATE.LIQUIDATING);
      await expect(shareModule.redeem(receivedShare, acceptPending)).to.be.revertedWith('InvalidState(4)');
    });

    it('when closed', async function () {
      await shareModule.setState(FUND_STATE.CLOSED);
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(shareModule, 'Redeemed')
        .withArgs(user1.address, receivedAsset, receivedShare);
    });

    it('transfer denomination token from vault to user', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const user1TokenDBalance = await tokenD.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(tokenD, 'Transfer')
        .withArgs(vault, user1.address, receivedAsset);

      // Verify
      expect((await tokenD.balanceOf(user1.address)).sub(user1TokenDBalance)).to.be.eq(receivedAsset);
    });

    it('burn share token from user', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      const user1ShareBalance = await shareToken.balanceOf(user1.address);

      // Execute
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, constants.AddressZero, receivedShare);

      // Verify
      expect(user1ShareBalance.sub(await shareToken.balanceOf(user1.address))).to.be.eq(receivedShare);
    });

    it('call before and after redeem', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await expect(shareModule.redeem(receivedShare, acceptPending))
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });

    it('should revert: redeem share is zero', async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await expect(shareModule.redeem(0, acceptPending)).to.be.revertedWith('RevertCode(72)'); // SHARE_MODULE_REDEEM_ZERO_SHARE
    });

    describe('user2 tried to frontrun user1 for bonus', function () {
      beforeEach(async function () {
        await tokenD.transfer(user2.address, totalAsset.mul(2)); // user2 will purchase twice
        await tokenD.connect(user2).approve(shareModule.address, constants.MaxUint256);

        // User2 purchases for the following frontrun
        await shareModule.connect(user2).purchase(totalAsset);
        await shareModule.setReserve(totalAsset); // user1 thought it is enough to redeem
        await shareModule.setGrossAssetValue(totalAsset.mul(2));

        // Stop automine
        await network.provider.send('evm_setAutomine', [false]);

        // User2 redeems first to consume all reserve
        await shareModule.connect(user2).redeem(totalShare, acceptPending);
        await shareModule.setReserve(0);
        await shareModule.setGrossAssetValue(totalAsset);

        // User1 redeems second and all received share suffer penalty
        const acceptPendingUser1 = true;
        await shareModule.redeem(receivedShare, acceptPendingUser1);
        await shareModule.setReserve(0);
        await shareModule.setGrossAssetValue(totalAsset.add(MINIMUM_SHARE));
      });

      it('user2 has no bonus when user2 frontruns user1 in the same block', async function () {
        // User2 purchases for the bonus in the same block
        await shareModule.connect(user2).purchase(totalAsset);

        // Mine the above txs in one block
        await network.provider.send('evm_mine', []);
        await network.provider.send('evm_setAutomine', [true]);

        // Same as calculateShare() since we can't do it before the above txs mined
        // 100e18 * (100e18) / (100e18+1000)
        const noBonusShare = totalShare.mul(totalAsset).div(totalAsset.add(MINIMUM_SHARE));

        // User2 has no bonus actually
        expect(await shareToken.balanceOf(user2.address)).to.be.eq(noBonusShare);
      });

      it('user2 has bonus when user2 purchases after one block', async function () {
        // Mine the above txs in one block
        await network.provider.send('evm_mine', []);
        await network.provider.send('evm_setAutomine', [true]);

        // Calculate expected share with bonus
        const bonus = await shareModule.currentTotalPendingBonus();
        const hasBonusShare = (await shareModule.calculateShare(totalAsset)).add(bonus);

        // User2 purchases for the bonus after one block
        await shareModule.connect(user2).purchase(totalAsset);

        // User2 has bonus
        expect(await shareToken.balanceOf(user2.address)).to.be.eq(hasBonusShare);
      });
    });
  });

  describe('Pending', function () {
    const pendingShare = ether('10'); // user's pending share
    const pendingAsset = pendingShare; // user's pending asset
    const actualShare = pendingShare.mul(penaltyBase - penalty).div(penaltyBase); // user's received share from partial redeem
    const actualAsset = actualShare; // user's received asset from partial redeem
    const bonus = pendingShare.mul(penalty).div(penaltyBase);
    const acceptPending = true;

    beforeEach(async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(receivedShare.sub(pendingAsset)); // vault's reserve before user's redeem
      await shareModule.setGrossAssetValue(totalAsset);
      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE)); // vault's gav after user's redeem
      expect((await shareModule.pendingUsers(user1.address)).pendingShare).to.be.eq(actualShare);
    });

    it('sufficient reserve', async function () {
      const pendingRound = await shareModule.currentPendingRound();
      await shareModule.setReserve(pendingAsset);
      const proxyShareBalance = await shareToken.balanceOf(shareModule.address);

      // Execute
      await expect(shareModule.settlePendingShare())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'PendingShareSettled');
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Verify
      const pendRoundInfo = await shareModule.pendingRoundList(pendingRound);

      // actualShare + bonus
      expect(proxyShareBalance.sub(await shareToken.balanceOf(shareModule.address))).to.be.eq(pendingShare);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);
      expect(pendRoundInfo.totalPendingShare).to.be.eq(actualShare);
      expect(pendRoundInfo.totalRedemption).to.be.eq(actualAsset);
    });

    it('pending twice: pending -> settle -> pending -> settle', async function () {
      // settle in round1
      const pendingRound1 = await shareModule.currentPendingRound();
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingShare())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'PendingShareSettled');
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Verify  of round1
      const pendRound1Info = await shareModule.pendingRoundList(pendingRound1);
      expect(pendRound1Info.totalPendingShare).to.be.eq(actualShare);
      expect(pendRound1Info.totalRedemption).to.be.eq(actualAsset);

      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShare).to.be.eq(actualShare);
      expect(pendingUser1.pendingRound).to.be.eq(pendingRound1);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);

      // Prepare round2
      await tokenD.connect(user1).transfer(user2.address, totalAsset);
      await tokenD.connect(user2).approve(shareModule.address, constants.MaxUint256);
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.connect(user2).purchase(totalAsset);
      await shareModule.setReserve(totalAsset.sub(pendingAsset));
      await shareModule.setGrossAssetValue(totalAsset.add(MINIMUM_SHARE));
      await shareModule.connect(user2).redeem(totalShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE));

      // Settle in round2
      const pendingRound2 = await shareModule.currentPendingRound();
      await shareModule.setReserve(pendingShare);
      await expect(shareModule.settlePendingShare())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset, actualShare)
        .to.emit(shareModule, 'PendingShareSettled');
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Verify in round2
      const pendRound2Info = await shareModule.pendingRoundList(pendingRound2);
      expect(pendingRound1).to.be.not.eq(pendingRound2);
      expect(pendRound2Info.totalPendingShare).to.be.eq(actualShare);
      expect(pendRound2Info.totalRedemption).to.be.eq(actualAsset);

      const pendingUser2 = await shareModule.pendingUsers(user2.address);
      expect(pendingUser2.pendingShare).to.be.eq(actualShare);
      expect(pendingUser2.pendingRound).to.be.eq(pendingRound2);
      expect(await shareModule.currentTotalPendingShare()).to.be.eq(0);
      expect(await shareModule.currentTotalPendingBonus()).to.be.eq(0);
    });

    it('should revert: when insufficient reserve', async function () {
      await expect(shareModule.settlePendingShare()).to.be.revertedWith('InvalidState(3)');
    });

    it('call before and after redeem', async function () {
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingShare())
        .to.emit(shareModule, 'BeforeRedeemCalled')
        .to.emit(shareModule, 'AfterRedeemCalled');
    });

    it('settle without penalty in specific usage', async function () {
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.settlePendingShareWithoutPenalty())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, pendingAsset, pendingShare);
    });

    describe('purchase', function () {
      it('receive bonus when purchasing', async function () {
        const purchaseAsset = actualAsset;
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(user1.address, purchaseAsset, pendingShare, bonus);
      });

      it('partially receive bonus when purchasing over amount', async function () {
        const purchaseAsset = actualAsset.mul(2);
        await expect(shareModule.purchase(purchaseAsset))
          .to.emit(shareModule, 'Purchased')
          .withArgs(user1.address, purchaseAsset, pendingShare.add(actualShare), bonus);
      });
    });

    it('settle the remain bonus when settle without penalty', async function () {
      const purchaseAsset = actualAsset.div(2);
      await shareModule.purchase(purchaseAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE).add(purchaseAsset));
      const pendingRound = await shareModule.currentPendingRound();

      // Execute
      await expect(shareModule.settlePendingShareWithoutPenalty())
        .to.emit(shareModule, 'Redeemed')
        .withArgs(shareModule.address, actualAsset.add(bonus.div(2)), actualShare.add(bonus.div(2)));

      // Verify
      const pendRoundInfo = await shareModule.pendingRoundList(pendingRound);
      expect(pendRoundInfo.totalPendingShare).to.be.eq(actualShare);
      expect(pendRoundInfo.totalRedemption).to.be.eq(actualAsset.add(bonus.div(2)));

      const pendingUser = await shareModule.pendingUsers(user1.address);
      expect(pendingUser.pendingShare).to.be.eq(actualShare);
      expect(pendingUser.pendingRound).to.be.eq(pendingRound);
    });
  });

  describe('Claim pending redemption', function () {
    const pendingShare = ether('10');
    const pendingAsset = pendingShare;
    const acceptPending = true;

    beforeEach(async function () {
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(totalAsset);
      await shareModule.setReserve(receivedShare.sub(pendingAsset));
      await shareModule.setGrossAssetValue(totalAsset);
    });

    it('claim the redemption', async function () {
      const redeemShare = pendingShare;
      const actualShare = redeemShare.mul(penaltyBase - penalty).div(penaltyBase);
      const actualAsset = actualShare;
      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE));
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingShare();
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Execute
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.claimPendingRedemption(user1.address))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);

      // Verify
      expect((await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)).to.be.eq(actualAsset);

      expect((await shareModule.pendingUsers(user1.address)).pendingShare).to.be.eq(0);
    });

    it('claim with difference user', async function () {
      // Transfer part of the share to user 2
      const redeemShare = pendingShare.div(2);
      const actualShare = redeemShare.mul(penaltyBase - penalty).div(penaltyBase);
      const actualAsset = actualShare;
      await shareToken.transfer(user2.address, redeemShare);

      // User 1 redeem
      await shareModule.redeem(receivedShare.sub(redeemShare), acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE));

      // User 2 redeem
      await shareModule.connect(user2).redeem(redeemShare, acceptPending);

      // Top up fund
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingShare();
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      const user2DenominationBefore = await tokenD.balanceOf(user2.address);

      // User 1 claim
      await expect(shareModule.connect(user1).claimPendingRedemption(user1.address))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset);

      // User 2 claim
      await expect(shareModule.connect(user2).claimPendingRedemption(user2.address))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user2.address, actualAsset)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user2.address, actualAsset);

      expect((await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)).to.be.eq(actualAsset);

      expect((await tokenD.balanceOf(user2.address)).sub(user2DenominationBefore)).to.be.eq(actualAsset);

      expect((await shareModule.pendingUsers(user1.address)).pendingShare).to.be.eq(0);

      expect((await shareModule.pendingUsers(user2.address)).pendingShare).to.be.eq(0);
    });

    it('claim pending share in normal redeem ', async function () {
      // 1st pending round and settle
      const currentPendingRound1 = await shareModule.currentPendingRound();
      const redeemShare1 = pendingShare;
      const actualShare1 = redeemShare1.mul(penaltyBase - penalty).div(penaltyBase);
      const actualAsset1 = actualShare1;

      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE));
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingShare();
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Verify in round1
      const pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShare).to.be.eq(actualAsset1);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound1);

      // Prepare redeem in round2
      const purchaseShare = ether('10');
      const purchaseAsset = purchaseShare;
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(purchaseShare);
      await shareModule.setReserve(purchaseAsset);
      await shareModule.setGrossAssetValue(purchaseAsset.add(MINIMUM_SHARE));

      // Execute redeem in round2
      const redeemShare = purchaseShare.div('2');
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.redeem(redeemShare, acceptPending))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset1)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset1);

      // Verify in round2
      // Previous pending redemption + redemption in round2
      expect((await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)).to.be.eq(
        actualAsset1.add(redeemShare)
      );
    });

    it('claim pending share in pending redeem ', async function () {
      //  settle in round1
      const currentPendingRound1 = await shareModule.currentPendingRound();
      const redeemShare1 = pendingShare;
      const actualShare1 = redeemShare1.mul(penaltyBase - penalty).div(penaltyBase);
      const actualAsset1 = actualShare1;
      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset.add(MINIMUM_SHARE));
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingShare();
      await shareModule.setGrossAssetValue(MINIMUM_SHARE); // left MINIMUM_SHARE after settle

      // Verify in round1
      let pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShare).to.be.eq(actualAsset1);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound1);

      // Prepare round2
      const totalAsset2 = totalAsset.mul(2);
      const totalShare2 = totalAsset2;
      const pendingShare2 = pendingShare.mul(2);
      const currentPendingRound2 = await shareModule.currentPendingRound();
      const redeemShare2 = pendingShare2;
      const actualShare2 = redeemShare2.mul(penaltyBase - penalty).div(penaltyBase);
      const actualAsset2 = actualShare2;
      const round2Reserve = totalAsset2.sub(pendingShare2);
      await shareModule.setState(FUND_STATE.EXECUTING);
      await shareModule.purchase(totalAsset2);
      await shareModule.setReserve(round2Reserve);
      await shareModule.setGrossAssetValue(totalAsset2.add(MINIMUM_SHARE));

      // Execute redeem in round2
      const user1DenominationBefore = await tokenD.balanceOf(user1.address);
      await expect(shareModule.redeem(totalShare2, acceptPending))
        .to.emit(shareModule, 'RedemptionClaimed')
        .withArgs(user1.address, actualAsset1)
        .to.emit(tokenD, 'Transfer')
        .withArgs(shareModule.address, user1.address, actualAsset1);

      // Verify
      // Previous pending redemption + partial redemption without pending round2
      expect((await tokenD.balanceOf(user1.address)).sub(user1DenominationBefore)).to.be.eq(
        actualAsset1.add(round2Reserve)
      );

      // check user1 pending info
      pendingUser1 = await shareModule.pendingUsers(user1.address);
      expect(pendingUser1.pendingShare).to.be.eq(actualAsset2);
      expect(pendingUser1.pendingRound).to.be.eq(currentPendingRound2);
    });

    it('should revert: pending round is not settle yet', async function () {
      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await expect(shareModule.claimPendingRedemption(user1.address)).to.be.revertedWith('RevertCode(76)'); // SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });

    it('should revert: claim the redemption', async function () {
      await shareModule.redeem(receivedShare, acceptPending);
      await shareModule.setReserve(0);
      await shareModule.setGrossAssetValue(pendingAsset);
      await shareModule.setReserve(pendingAsset);
      await shareModule.settlePendingShare();

      await expect(shareModule.connect(user2).claimPendingRedemption(user2.address)).to.be.revertedWith(
        'RevertCode(76)'
      ); // SHARE_MODULE_PENDING_REDEMPTION_NOT_CLAIMABLE
    });
  });
});
