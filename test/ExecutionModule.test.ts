import { constants, Wallet, BigNumber } from 'ethers';
import { expect } from 'chai';
import { ethers, deployments } from 'hardhat';
import {
  Comptroller,
  ExecutionModuleMock,
  SimpleAction,
  SimpleToken,
} from '../typechain';
import { DS_PROXY_REGISTRY } from './utils/constants';

describe('Execution module', function () {
  let executionModule: ExecutionModuleMock;
  let comptroller: Comptroller;
  let action: SimpleAction;
  let user: Wallet;
  let tokenD: SimpleToken;
  let vault: any;

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
        await ethers.getContractFactory('Comptroller')
      ).deploy(
        executionModule.address,
        constants.AddressZero,
        constants.AddressZero,
        constants.Zero,
        constants.AddressZero,
        constants.Zero,
        constants.AddressZero
      );
      await comptroller.deployed();
      tokenD = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenD.deployed();
      action = await (await ethers.getContractFactory('SimpleAction')).deploy();
      await action.deployed();
      // initialize
      await comptroller.setExecAction(action.address);
      await comptroller.permitDenominations([tokenD.address], [0]);
      await executionModule.setComptroller(comptroller.address);
      await executionModule.setDenomination(tokenD.address);
      await executionModule.setVault();
      vault = await executionModule.callStatic.vault();
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

    it('should fail when reviewing', async function () {
      await executionModule.setState(1);
      const executionData = action.interface.encodeFunctionData('foo');
      await expect(executionModule.execute(executionData)).to.be.revertedWith(
        'InvalidState(1)'
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
