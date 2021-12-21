import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  ComptrollerMock,
  ExecutionModuleMock,
  SimpleAction,
  SimpleToken,
} from '../typechain';
import { DS_PROXY_REGISTRY } from './utils/constants';

describe('Execution module', function () {
  let executionModule: ExecutionModuleMock;
  let comptroller: ComptrollerMock;
  let action: SimpleAction;
  let user: Wallet;
  let token: SimpleToken;
  let vault: any;
  const purchaseAmount = ethers.utils.parseEther('100');

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture();
      [user] = await (ethers as any).getSigners();
      executionModule = await (
        await ethers.getContractFactory('ExecutionModuleMock')
      )
        .connect(user)
        .deploy(DS_PROXY_REGISTRY);
      await executionModule.deployed();
      comptroller = await (
        await ethers.getContractFactory('ComptrollerMock')
      ).deploy();
      await comptroller.deployed();
      action = await (await ethers.getContractFactory('SimpleAction')).deploy();
      await action.deployed();
      // initialize
      await comptroller.setAction(action.address);
      await executionModule.setDSProxy();
      vault = await executionModule.callStatic.vault();
      await executionModule.setComptroller(comptroller.address);
    }
  );

  beforeEach(async function () {
    await setupTest();
  });

  describe('Execute', function () {
    it('should success when executing', async function () {
      await executionModule.setState(2);
      const executionData = action.interface.encodeFunctionData('foo');
      await executionModule.execute(executionData);
      const result = await action.callStatic.bar();
      expect(result).to.eq(BigNumber.from('1'));
    });

    it('should success when redeem pending', async function () {
      await executionModule.setState(3);
      const executionData = action.interface.encodeFunctionData('foo');
      await executionModule.execute(executionData);
      const result = await action.callStatic.bar();
      expect(result).to.eq(BigNumber.from('1'));
    });

    it('should fail when initializing', async function () {
      await executionModule.setState(0);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData)).to.be.revertedWith(
        'InvalidState(0)'
      );
    });

    it('should fail when ready', async function () {
      await executionModule.setState(1);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData)).to.be.revertedWith(
        'InvalidState(1)'
      );
    });

    it('should fail when liquidating', async function () {
      await executionModule.setState(4);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData)).to.be.revertedWith(
        'InvalidState(4)'
      );
    });

    it('should fail when closed', async function () {
      await executionModule.setState(5);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData)).to.be.revertedWith(
        'InvalidState(5)'
      );
    });

    it('should call before/afterExecute', async function () {
      await executionModule.setState(2);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData))
        .to.emit(executionModule, 'BeforeExecuteCalled')
        .to.emit(executionModule, 'AfterExecuteCalled');
    });
  });
});
