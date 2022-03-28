import { Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import { MortgageVault, SimpleToken } from '../typechain';

describe('MortgageVault', function () {
  let mortgageVault: MortgageVault;

  let user: Wallet;
  let pool: Wallet;

  let token: SimpleToken;

  const stakingAmount = ethers.utils.parseEther('1');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(''); // ensure you start from a fresh deployments
      [user, pool] = await (ethers as any).getSigners();

      token = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await token.deployed();

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(token.address);
      await mortgageVault.deployed();
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    // setupTest will use the evm_snapshot to reset environment for speed up testing
    await setupTest();
  });

  describe('mortgage', function () {
    beforeEach(async function () {
      await token.approve(mortgageVault.address, stakingAmount);
    });

    it('should succeed when sender balance is sufficient', async function () {
      const userBalanceBefore = await token.callStatic.balanceOf(user.address);
      const vaultBalanceBefore = await token.callStatic.balanceOf(
        mortgageVault.address
      );
      await expect(
        mortgageVault.mortgage(user.address, pool.address, stakingAmount)
      )
        .to.emit(mortgageVault, 'Mortgaged')
        .withArgs(user.address, pool.address, stakingAmount);
      const userBalanceAfter = await token.callStatic.balanceOf(user.address);
      const vaultBalanceAfter = await token.callStatic.balanceOf(
        mortgageVault.address
      );
      const poolMortgage = await mortgageVault.callStatic.poolAmounts(
        pool.address
      );
      const totalMortgage = await mortgageVault.callStatic.totalAmount();
      expect(userBalanceBefore.sub(userBalanceAfter)).to.be.eq(stakingAmount);
      expect(vaultBalanceAfter.sub(vaultBalanceBefore)).to.be.eq(stakingAmount);
      expect(poolMortgage).to.be.eq(stakingAmount);
      expect(totalMortgage).to.be.eq(stakingAmount);
    });

    it('should fail when pool is already mortgaged', async function () {
      await mortgageVault.mortgage(user.address, pool.address, stakingAmount);
      await expect(
        mortgageVault.mortgage(user.address, pool.address, stakingAmount)
      ).to.be.revertedWith('revertCode(5)'); // MORTGAGE_VAULT_POOL_MORTGAGED
    });
  });

  describe('claim', function () {
    beforeEach(async function () {
      await token.approve(mortgageVault.address, stakingAmount);
      await mortgageVault.mortgage(user.address, pool.address, stakingAmount);
    });

    it('should succeed to claim', async function () {
      const userBalanceBefore = await token.callStatic.balanceOf(user.address);
      const vaultBalanceBefore = await token.callStatic.balanceOf(
        mortgageVault.address
      );
      await expect(mortgageVault.connect(pool).claim(user.address))
        .to.emit(mortgageVault, 'Claimed')
        .withArgs(user.address, pool.address, stakingAmount);

      const userBalanceAfter = await token.callStatic.balanceOf(user.address);
      const vaultBalanceAfter = await token.callStatic.balanceOf(
        mortgageVault.address
      );
      const poolMortgage = await mortgageVault.callStatic.poolAmounts(
        pool.address
      );
      const totalMortgage = await mortgageVault.callStatic.totalAmount();
      expect(userBalanceAfter.sub(userBalanceBefore)).to.be.eq(stakingAmount);
      expect(vaultBalanceBefore.sub(vaultBalanceAfter)).to.be.eq(stakingAmount);
      expect(poolMortgage).to.be.eq(ethers.constants.Zero);
      expect(totalMortgage).to.be.eq(ethers.constants.Zero);
    });
  });
});
