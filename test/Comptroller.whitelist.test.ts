import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { deployments } from 'hardhat';
import {
  Comptroller,
  Implementation,
  AssetRouter,
  AMock,
  HMock,
} from '../typechain';
import {
  DS_PROXY_REGISTRY,
  WL_ANY_SIG,
  WL_ANY_ADDRESS,
} from './utils/constants';

describe('Comptroller_Whitelist', function () {
  let comptroller: Comptroller;
  let implementation: Implementation;
  let assetRouter: AssetRouter;
  let actionMockA: AMock;
  let actionMockB: AMock;
  let handlerMockA: HMock;
  let handlerMockB: HMock;

  let owner: Wallet;
  let user: Wallet;
  let collector: Wallet;

  const setupTest = deployments.createFixture(
    async ({ deployments, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      [owner, user, collector] = await (ethers as any).getSigners();

      implementation = await (
        await ethers.getContractFactory('Implementation')
      ).deploy(DS_PROXY_REGISTRY, 'PoolToken', 'PCT');
      await implementation.deployed();

      assetRouter = await (
        await ethers.getContractFactory('AssetRouter')
      ).deploy();
      await assetRouter.deployed();

      comptroller = await (
        await ethers.getContractFactory('Comptroller')
      ).deploy(implementation.address, assetRouter.address, collector.address);
      await comptroller.deployed();

      actionMockA = await (await ethers.getContractFactory('AMock')).deploy();
      await actionMockA.deployed();

      actionMockB = await (await ethers.getContractFactory('AMock')).deploy();
      await actionMockB.deployed();

      handlerMockA = await (await ethers.getContractFactory('HMock')).deploy();
      await handlerMockA.deployed();

      handlerMockB = await (await ethers.getContractFactory('HMock')).deploy();
      await handlerMockB.deployed();
    }
  );

  // `beforeEach` will run before each test, re-deploying the contract every
  // time. It receives a callback, which can be async.
  beforeEach(async function () {
    await setupTest();
  });

  // manager management
  describe('manager management', function () {
    it('permit single manager', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(false);

      // permit manager
      await expect(comptroller.permitManagers([user.address]))
        .to.emit(comptroller, 'PermitManager')
        .withArgs(user.address);

      // check managers
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(false);
    });

    it('permit multiple managers', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(false);

      // permit managers
      const receipt = await comptroller.permitManagers([
        user.address,
        collector.address,
      ]);

      // check events
      await expect(receipt)
        .to.emit(comptroller, 'PermitManager')
        .withArgs(user.address);
      await expect(receipt)
        .to.emit(comptroller, 'PermitManager')
        .withArgs(collector.address);

      // check managers
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(true);
    });

    it('permit ANY managers', async function () {
      // check env before execution
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(false);

      // permit managers
      await expect(comptroller.permitManagers([WL_ANY_ADDRESS]))
        .to.emit(comptroller, 'PermitManager')
        .withArgs(WL_ANY_ADDRESS);

      // check managers
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(true);
    });

    it('forbid single manager', async function () {
      // check env before execution
      await comptroller.permitManagers([user.address, collector.address]);
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);

      // permit manager
      await expect(comptroller.forbidManagers([user.address]))
        .to.emit(comptroller, 'ForbidManager')
        .withArgs(user.address);

      // check managers
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(true);
    });

    it('forbid multiple managers', async function () {
      // check env before execution
      await comptroller.permitManagers([user.address, collector.address]);
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(true);

      // forbid managers
      const receipt = await comptroller.forbidManagers([
        user.address,
        collector.address,
      ]);

      // check events
      await expect(receipt)
        .to.emit(comptroller, 'ForbidManager')
        .withArgs(user.address);
      await expect(receipt)
        .to.emit(comptroller, 'ForbidManager')
        .withArgs(collector.address);

      // check managers
      expect(
        await comptroller.connect(user).validManager(user.address)
      ).to.be.equal(false);
      expect(
        await comptroller.connect(user).validManager(collector.address)
      ).to.be.equal(false);
    });

    it('should revert: permit manager by non-owner', async function () {
      await expect(
        comptroller.connect(user).permitManagers([user.address])
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should revert: forbid manager by non-owner', async function () {
      await expect(
        comptroller.connect(user).forbidManagers([user.address])
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
