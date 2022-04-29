import { Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { MortgageVault, SimpleToken } from '../typechain';

describe('MortgageVault', function () {
  let mortgageVault: MortgageVault;

  let user: Wallet;
  let receiver: Wallet;

  let token: SimpleToken;

  const amount = ethers.utils.parseEther('1');

  const setupTest = deployments.createFixture(async ({ deployments, ethers }, options) => {
    await deployments.fixture(''); // ensure you start from a fresh deployments
    [user, receiver] = await (ethers as any).getSigners();

    token = await (await ethers.getContractFactory('SimpleToken')).connect(user).deploy();
    await token.deployed();

    mortgageVault = await (await ethers.getContractFactory('MortgageVault')).deploy(token.address);
    await mortgageVault.deployed();
  });

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('mortgage', function () {
    beforeEach(async function () {
      await token.approve(mortgageVault.address, amount);
    });

    it('sender balance is sufficient', async function () {
      const userBalanceBefore = await token.balanceOf(user.address);
      const vaultBalanceBefore = await token.balanceOf(mortgageVault.address);
      await expect(mortgageVault.mortgage(amount)).to.emit(mortgageVault, 'Mortgaged').withArgs(user.address, amount);
      const userBalanceAfter = await token.balanceOf(user.address);
      const vaultBalanceAfter = await token.balanceOf(mortgageVault.address);
      const fundMortgage = await mortgageVault.fundAmounts(user.address);
      const totalMortgage = await mortgageVault.totalAmount();
      expect(userBalanceBefore.sub(userBalanceAfter)).to.be.eq(amount);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).to.be.eq(amount);
      expect(fundMortgage).to.be.eq(amount);
      expect(totalMortgage).to.be.eq(amount);
    });

    it('zero amount without event', async function () {
      await expect(mortgageVault.mortgage(0)).to.not.emit(mortgageVault, 'Mortgaged');
    });

    it('should revert: when sender is already mortgaged', async function () {
      await mortgageVault.mortgage(amount);
      await expect(mortgageVault.mortgage(amount)).to.be.revertedWith('RevertCode(22)'); // MORTGAGE_VAULT_FUND_MORTGAGED
    });
  });

  describe('claim', function () {
    beforeEach(async function () {
      await token.approve(mortgageVault.address, amount);
    });

    it('all mortgage', async function () {
      await mortgageVault.mortgage(amount);
      const receiverBalanceBefore = await token.balanceOf(receiver.address);
      const vaultBalanceBefore = await token.balanceOf(mortgageVault.address);
      await expect(mortgageVault.claim(receiver.address))
        .to.emit(mortgageVault, 'Claimed')
        .withArgs(receiver.address, user.address, amount);

      const receiverBalanceAfter = await token.balanceOf(receiver.address);
      const vaultBalanceAfter = await token.balanceOf(mortgageVault.address);
      const fundMortgage = await mortgageVault.fundAmounts(user.address);
      const totalMortgage = await mortgageVault.totalAmount();
      expect(receiverBalanceAfter.sub(receiverBalanceBefore)).to.be.eq(amount);
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).to.be.eq(amount);
      expect(fundMortgage).to.be.eq(ethers.constants.Zero);
      expect(totalMortgage).to.be.eq(ethers.constants.Zero);
    });

    it('zero amount without event', async function () {
      await expect(mortgageVault.claim(receiver.address)).to.not.emit(mortgageVault, 'Claimed');
    });
  });
});
