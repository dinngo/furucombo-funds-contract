import { BigNumber, Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import { ShareToken } from '../typechain';
import { ether } from './utils/utils';

describe('ShareToken', function () {
  let shareToken: ShareToken;
  let owner: Wallet;
  let user1: Wallet;
  let user2: Wallet;

  const balance = ether('100');

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture('');
    [owner, user1, user2] = await (ethers as any).getSigners();

    shareToken = await (await ethers.getContractFactory('ShareToken'))
      .connect(owner)
      .deploy('share token', 'SHARE', BigNumber.from(18));
    await shareToken.deployed();
    await shareToken.connect(owner).mint(user1.address, balance);
  });

  beforeEach(async function () {
    await setupTest();
  });

  describe('beforeTokenTransfer', function () {
    it('should revert: invalid from share token', async function () {
      await expect(shareToken.move(shareToken.address, user1.address, ether('1'))).to.be.revertedWith('RevertCode(84)'); // SHARE_TOKEN_INVALID_FROM
    });
    it('should revert: invalid to address(1)', async function () {
      await expect(
        shareToken.connect(user1).transfer('0x0000000000000000000000000000000000000001', balance)
      ).to.be.revertedWith('RevertCode(6)'); // SHARE_TOKEN_INVALID_TO
    });
  });

  describe('move', function () {
    let user1Balance: BigNumber;
    let user2Balance: BigNumber;

    beforeEach(async function () {
      user1Balance = await shareToken.balanceOf(user1.address);
      user2Balance = await shareToken.balanceOf(user2.address);
    });

    it('move by owner', async function () {
      await expect(shareToken.connect(owner).move(user1.address, user2.address, balance))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, user2.address, balance);
      const user1BalanceAfter = await shareToken.balanceOf(user1.address);
      const user2BalanceAfter = await shareToken.balanceOf(user2.address);
      expect(user1Balance.sub(user1BalanceAfter)).to.be.eq(balance);
      expect(user2BalanceAfter.sub(user2Balance)).to.be.eq(balance);
    });

    it('should revert: move by non-owner', async function () {
      await expect(shareToken.connect(user2).move(user1.address, user2.address, balance)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('approved move', function () {
    let user1Balance: BigNumber;
    let user2Balance: BigNumber;
    let user1Allowance: BigNumber;
    const approval = balance.div(2);

    beforeEach(async function () {
      await shareToken.connect(user1).approve(user2.address, approval);
      user1Balance = await shareToken.balanceOf(user1.address);
      user2Balance = await shareToken.balanceOf(user2.address);
      user1Allowance = await shareToken.allowance(user1.address, user2.address);
    });

    it('approved move by owner', async function () {
      await expect(shareToken.connect(owner).approvedMove(user2.address, user1.address, user2.address, approval))
        .to.emit(shareToken, 'Transfer')
        .withArgs(user1.address, user2.address, approval);
      const user1BalanceAfter = await shareToken.balanceOf(user1.address);
      const user2BalanceAfter = await shareToken.balanceOf(user2.address);
      const user1AllowanceAfter = await shareToken.allowance(user1.address, user2.address);
      expect(user1Balance.sub(user1BalanceAfter)).to.be.eq(approval);
      expect(user2BalanceAfter.sub(user2Balance)).to.be.eq(approval);
      expect(user1Allowance.sub(user1AllowanceAfter)).to.be.eq(approval);
    });

    it('should revert: insufficient approval', async function () {
      await expect(
        shareToken.connect(owner).approvedMove(user2.address, user1.address, user2.address, balance)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert: approved move by non-owner', async function () {
      await expect(
        shareToken.connect(user2).approvedMove(user2.address, user1.address, user2.address, approval)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('set approval', function () {
    it('set approval by owner', async function () {
      await expect(shareToken.connect(owner).setApproval(user1.address, user2.address, balance))
        .to.emit(shareToken, 'Approval')
        .withArgs(user1.address, user2.address, balance);
      const allowance = await shareToken.allowance(user1.address, user2.address);
      expect(allowance).to.be.eq(balance);
    });

    it('should revert: set approval by non-owner', async function () {
      await expect(shareToken.connect(user1).setApproval(user1.address, user2.address, balance)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });
});
