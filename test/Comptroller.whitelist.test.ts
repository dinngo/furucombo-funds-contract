import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  ComptrollerImplementation,
  ComptrollerProxy,
  PoolImplementation,
  AssetRouter,
  MortgageVault,
  AMock,
  HandlerMock,
  Chainlink,
  AssetRegistry,
  SimpleToken,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  WL_ANY_SIG,
  WL_ANY_ADDRESS,
} from './utils/constants';

describe('ComptrollerImplementation_Whitelist', function () {
  let comptrollerImplementation: ComptrollerImplementation;
  let comptrollerProxy: ComptrollerProxy;
  let comptroller: ComptrollerImplementation;
  let poolImplementation: PoolImplementation;
  let assetRouter: AssetRouter;
  let mortgageVault: MortgageVault;
  let actionMockA: AMock;
  let actionMockB: AMock;
  let handlerMockA: HandlerMock;
  let handlerMockB: HandlerMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;

  let oracle: Chainlink;
  let registry: AssetRegistry;
  let tokenM: SimpleToken;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, collector] = await (ethers as any).getSigners();

      tokenM = await (await ethers.getContractFactory('SimpleToken'))
        .connect(user)
        .deploy();
      await tokenM.deployed();

      poolImplementation = await (
        await ethers.getContractFactory('PoolImplementation')
      ).deploy(DS_PROXY_REGISTRY);
      await poolImplementation.deployed();

      registry = await (
        await ethers.getContractFactory('AssetRegistry')
      ).deploy();
      await registry.deployed();

      oracle = await (await ethers.getContractFactory('Chainlink')).deploy();
      await oracle.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy(oracle.address, registry.address);
      await assetRouter.deployed();

      const execFeePercentage = 200; // 20%

      mortgageVault = await (
        await ethers.getContractFactory('MortgageVault')
      ).deploy(tokenM.address);
      await mortgageVault.deployed();

      comptrollerImplementation = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).deploy();
      await comptrollerImplementation.deployed();

      const compData = comptrollerImplementation.interface.encodeFunctionData(
        'initialize',
        [
          poolImplementation.address,
          assetRouter.address,
          collector.address,
          execFeePercentage,
          constants.AddressZero,
          0,
          mortgageVault.address,
          0,
        ]
      );

      comptrollerProxy = await (
        await ethers.getContractFactory('ComptrollerProxy')
      ).deploy(comptrollerImplementation.address, compData);
      await comptrollerProxy.deployed();

      comptroller = await (
        await ethers.getContractFactory('ComptrollerImplementation')
      ).attach(comptrollerProxy.address);

      actionMockA = await (await ethers.getContractFactory('AMock')).deploy();
      await actionMockA.deployed();

      actionMockB = await (await ethers.getContractFactory('AMock')).deploy();
      await actionMockB.deployed();

      handlerMockA = await (
        await ethers.getContractFactory('HandlerMock')
      ).deploy();
      await handlerMockA.deployed();

      handlerMockB = await (
        await ethers.getContractFactory('HandlerMock')
      ).deploy();
      await handlerMockB.deployed();
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    await setupTest();
  });

  // creator management
  describe('creator management', function () {
    it('permit single creator', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(false);

      // permit creator
      await expect(comptroller.permitCreators([user.address]))
        .to.emit(comptroller, 'PermitCreator')
        .withArgs(user.address);

      // check creators
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(false);
    });

    it('permit multiple creators', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(false);

      // permit creators
      const receipt = await comptroller.permitCreators([
        user.address,
        collector.address,
      ]);

      // check events
      await expect(receipt)
        .to.emit(comptroller, 'PermitCreator')
        .withArgs(user.address);
      await expect(receipt)
        .to.emit(comptroller, 'PermitCreator')
        .withArgs(collector.address);

      // check creators
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(true);
    });

    it('permit ANY creators', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(false);

      // permit creators
      await expect(comptroller.permitCreators([WL_ANY_ADDRESS]))
        .to.emit(comptroller, 'PermitCreator')
        .withArgs(WL_ANY_ADDRESS);

      // check creators
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(true);
    });

    it('forbid single creator', async function () {
      // check env before execution
      await comptroller.permitCreators([user.address, collector.address]);
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);

      // permit creator
      await expect(comptroller.forbidCreators([user.address]))
        .to.emit(comptroller, 'ForbidCreator')
        .withArgs(user.address);

      // check creators
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(true);
    });

    it('forbid multiple creators', async function () {
      // check env before execution
      await comptroller.permitCreators([user.address, collector.address]);
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(true);

      // forbid creators
      const receipt = await comptroller.forbidCreators([
        user.address,
        collector.address,
      ]);

      // check events
      await expect(receipt)
        .to.emit(comptroller, 'ForbidCreator')
        .withArgs(user.address);
      await expect(receipt)
        .to.emit(comptroller, 'ForbidCreator')
        .withArgs(collector.address);

      // check creators
      expect(
        await comptroller.connect(user).isValidCreator(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).isValidCreator(collector.address)
      ).to.be.equal(false);
    });

    it('should revert: permit creator by non-owner', async function () {
      await expect(
        comptroller.connect(user).permitCreators([user.address])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: forbid creator by non-owner', async function () {
      await expect(
        comptroller.connect(user).forbidCreators([user.address])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  // delegate call
  describe('delegate call management', function () {
    const level = 1;
    const otherLevel = 0;
    let sigA: string, sigB: string;

    beforeEach(async function () {
      sigA = actionMockA.interface.getSighash('doUint(uint256)');
      sigB = actionMockA.interface.getSighash('doAddress(address)');
    });

    describe('permit', function () {
      it('permit delegate call', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);

        // permit delegate call
        const receipt = await comptroller.permitDelegateCalls(
          level,
          [actionMockA.address, actionMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'PermitDelegateCall')
          .withArgs(level, actionMockA.address, sigA);
        await expect(receipt)
          .to.emit(comptroller, 'PermitDelegateCall')
          .withArgs(level, actionMockB.address, sigB);

        // check delegate call
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigB)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('permit delegate call with ANY sigs', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigB)
        ).to.be.equal(false);

        // permit delegate call
        await expect(
          comptroller.permitDelegateCalls(
            level,
            [actionMockA.address],
            [WL_ANY_SIG]
          )
        )
          .to.emit(comptroller, 'PermitDelegateCall')
          .withArgs(level, actionMockA.address, WL_ANY_SIG);

        // check delegate calls
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);

        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigA)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('permit delegate call with ANY levels', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);

        // permit delegate call
        await expect(
          comptroller.permitDelegateCalls(
            constants.MaxUint256.toString(),
            [actionMockA.address],
            [sigA]
          )
        )
          .to.emit(comptroller, 'PermitDelegateCall')
          .withArgs(constants.MaxUint256.toString(), actionMockA.address, sigA);

        // check delegate calls
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);

        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(otherLevel, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(otherLevel, actionMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('should revert: permit delegate call by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .permitDelegateCalls(level, [actionMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('forbid', function () {
      beforeEach(async function () {
        // check env before execution
        await comptroller.permitDelegateCalls(
          level,
          [actionMockA.address, actionMockA.address, actionMockB.address],
          [sigA, sigB, sigB]
        );

        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('forbid delegate call', async function () {
        // forbid delegate call
        const receipt = await comptroller.forbidDelegateCalls(
          level,
          [actionMockA.address, actionMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'ForbidDelegateCall')
          .withArgs(level, actionMockA.address, sigA);

        await expect(receipt)
          .to.emit(comptroller, 'ForbidDelegateCall')
          .withArgs(level, actionMockB.address, sigB);

        // check delegate call
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canDelegateCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);
      });

      it('should revert: forbid delegate call by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .forbidDelegateCalls(level, [actionMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  // contract call
  describe('contract call management', function () {
    const level = 1;
    const otherLevel = 0;
    let sigA: string, sigB: string;

    beforeEach(async function () {
      sigA = actionMockA.interface.getSighash('doUint(uint256)');
      sigB = actionMockA.interface.getSighash('doAddress(address)');
    });

    describe('permit', function () {
      it('permit contract call', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);

        // permit contract call
        const receipt = await comptroller.permitContractCalls(
          level,
          [actionMockA.address, actionMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'PermitContractCall')
          .withArgs(level, actionMockA.address, sigA);
        await expect(receipt)
          .to.emit(comptroller, 'PermitContractCall')
          .withArgs(level, actionMockB.address, sigB);

        // check contract call
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigB)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('permit contract call with ANY sigs', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigB)
        ).to.be.equal(false);

        // permit contract call
        await expect(
          comptroller.permitContractCalls(
            level,
            [actionMockA.address],
            [WL_ANY_SIG]
          )
        )
          .to.emit(comptroller, 'PermitContractCall')
          .withArgs(level, actionMockA.address, WL_ANY_SIG);

        // check contract calls
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);

        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigA)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('permit contract call with ANY levels', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);

        // permit contract call
        await expect(
          comptroller.permitContractCalls(
            constants.MaxUint256.toString(),
            [actionMockA.address],
            [sigA]
          )
        )
          .to.emit(comptroller, 'PermitContractCall')
          .withArgs(constants.MaxUint256.toString(), actionMockA.address, sigA);

        // check contract calls
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(otherLevel, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(otherLevel, actionMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('should revert: permit contract call by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .permitContractCalls(level, [actionMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('forbid', function () {
      beforeEach(async function () {
        // check env before execution
        await comptroller.permitContractCalls(
          level,
          [actionMockA.address, actionMockA.address, actionMockB.address],
          [sigA, sigB, sigB]
        );

        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('forbid contract call', async function () {
        // forbid contract call
        const receipt = await comptroller.forbidContractCalls(
          level,
          [actionMockA.address, actionMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'ForbidContractCall')
          .withArgs(level, actionMockA.address, sigA);

        await expect(receipt)
          .to.emit(comptroller, 'ForbidContractCall')
          .withArgs(level, actionMockB.address, sigB);

        // check contract call
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canContractCall(level, actionMockA.address, sigB)
        ).to.be.equal(true);
      });

      it('should revert: forbid contract call by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .forbidContractCalls(level, [actionMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });

  // handler call
  describe('handler management', function () {
    const level = 1;
    const otherLevel = 0;
    let sigA: string, sigB: string;

    beforeEach(async function () {
      sigA = handlerMockA.interface.getSighash('doUint(uint256)');
      sigB = handlerMockA.interface.getSighash('doAddress(address)');
    });

    describe('permit', function () {
      it('permit handler call', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(false);

        // permit handler call
        const receipt = await comptroller.permitHandlers(
          level,
          [handlerMockA.address, handlerMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'PermitHandler')
          .withArgs(level, handlerMockA.address, sigA);
        await expect(receipt)
          .to.emit(comptroller, 'PermitHandler')
          .withArgs(level, handlerMockB.address, sigB);

        // check handler call
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigB)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('permit handler call with ANY sigs', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigB)
        ).to.be.equal(false);

        // permit handler call
        await expect(
          comptroller.permitHandlers(
            level,
            [handlerMockA.address],
            [WL_ANY_SIG]
          )
        )
          .to.emit(comptroller, 'PermitHandler')
          .withArgs(level, handlerMockA.address, WL_ANY_SIG);

        // check handler calls
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigB)
        ).to.be.equal(true);

        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigA)
        ).to.be.equal(false);

        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('permit handler call with ANY levels', async function () {
        // check env before execution
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(false);

        // permit handler call
        await expect(
          comptroller.permitHandlers(
            constants.MaxUint256.toString(),
            [handlerMockA.address],
            [sigA]
          )
        )
          .to.emit(comptroller, 'PermitHandler')
          .withArgs(
            constants.MaxUint256.toString(),
            handlerMockA.address,
            sigA
          );

        // check handler calls
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(true);

        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(otherLevel, handlerMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(otherLevel, handlerMockB.address, sigB)
        ).to.be.equal(false);
      });

      it('should revert: permit handler call by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .permitHandlers(level, [handlerMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('forbid', function () {
      beforeEach(async function () {
        // check env before execution
        await comptroller.permitHandlers(
          level,
          [handlerMockA.address, handlerMockA.address, handlerMockB.address],
          [sigA, sigB, sigB]
        );

        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigB)
        ).to.be.equal(true);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(true);
      });

      it('forbid handler call', async function () {
        // forbid handler call
        const receipt = await comptroller.forbidHandlers(
          level,
          [handlerMockA.address, handlerMockB.address],
          [sigA, sigB]
        );

        // check event
        await expect(receipt)
          .to.emit(comptroller, 'ForbidHandler')
          .withArgs(level, handlerMockA.address, sigA);

        await expect(receipt)
          .to.emit(comptroller, 'ForbidHandler')
          .withArgs(level, handlerMockB.address, sigB);

        // check handler call
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigA)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockB.address, sigB)
        ).to.be.equal(false);
        expect(
          await comptroller
            .connect(user)
            .canHandlerCall(level, handlerMockA.address, sigB)
        ).to.be.equal(true);
      });

      it('should revert: forbid handler by non-owner', async function () {
        await expect(
          comptroller
            .connect(user)
            .forbidHandlers(level, [handlerMockA.address], [sigA])
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });
  });
});
