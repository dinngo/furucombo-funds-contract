import { constants, Wallet } from 'ethers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { FurucomboRegistry } from '../../typechain';

import { ether, asciiToHex32 } from '../utils/utils';

describe('FurucomboRegistry', function () {
  let owner: Wallet;
  let contract1: Wallet;
  let contract2: Wallet;
  let someone: Wallet;

  let registry: FurucomboRegistry;
  const info = asciiToHex32('test');
  const info2 = asciiToHex32('test2');
  const infoPaddedHex = asciiToHex32('test');
  const deprecatedPaddedHex = asciiToHex32('deprecated');

  beforeEach(async function () {
    [owner, contract1, contract2, someone] = await (ethers as any).getSigners();

    registry = await (await ethers.getContractFactory('FurucomboRegistry')).deploy();
    await registry.deployed();
  });

  describe('register', function () {
    it('normal', async function () {
      await expect(registry.register(contract1.address, info))
        .to.emit(registry, 'Registered')
        .withArgs(contract1.address, infoPaddedHex);

      expect(await registry.isValidHandler(contract1.address)).to.be.eq(true);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).register(contract1.address, info)).to.be.reverted;
    });

    it('zero address', async function () {
      await expect(registry.register(constants.AddressZero, info)).to.be.reverted;
    });

    it('set info', async function () {
      await registry.register(contract1.address, info);
      await registry.register(contract1.address, info2);
      expect(await registry.isValidHandler(contract1.address)).to.be.eq(true);
    });

    it('unregistered', async function () {
      await registry.register(contract1.address, info);
      await registry.unregister(contract1.address);

      await expect(registry.register(contract1.address, info)).to.be.revertedWith('unregistered');
    });
  });

  describe('unregister', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
    });

    it('normal', async function () {
      await expect(registry.unregister(contract1.address))
        .to.emit(registry, 'Unregistered')
        .withArgs(contract1.address);
      expect(await registry.isValidHandler(contract1.address)).to.be.eq(false);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).unregister(contract1.address)).to.be.reverted;
    });

    it('no registration', async function () {
      await expect(registry.unregister(contract2.address)).to.be.revertedWith('no registration');
    });

    it('unregistered', async function () {
      await registry.unregister(contract1.address);
      await expect(registry.unregister(contract1.address)).to.be.revertedWith('unregistered');
    });
  });

  describe('register caller', function () {
    it('normal', async function () {
      await expect(registry.registerCaller(contract1.address, info))
        .to.emit(registry, 'CallerRegistered')
        .withArgs(contract1.address, infoPaddedHex);

      expect(await registry.isValidCaller(contract1.address)).to.be.eq(true);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).registerCaller(contract1.address, info)).to.be.reverted;
    });

    it('zero address', async function () {
      await expect(registry.registerCaller(constants.AddressZero, info)).to.be.reverted;
    });

    it('set info', async function () {
      await registry.registerCaller(contract1.address, info);
      await registry.registerCaller(contract1.address, info2);
      expect(await registry.isValidCaller(contract1.address)).to.be.eq(true);
    });

    it('unregistered', async function () {
      await registry.registerCaller(contract1.address, info);
      await registry.unregisterCaller(contract1.address);
      await expect(registry.registerCaller(contract1.address, info)).to.be.revertedWith('unregistered');
    });
  });

  describe('unregister caller', function () {
    beforeEach(async function () {
      await registry.registerCaller(contract1.address, info);
    });

    it('normal', async function () {
      await expect(registry.unregisterCaller(contract1.address))
        .to.emit(registry, 'CallerUnregistered')
        .withArgs(contract1.address);

      expect(await registry.isValidCaller(contract1.address)).to.be.eq(false);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).unregisterCaller(constants.AddressZero)).to.be.reverted;
    });

    it('no registration', async function () {
      await expect(registry.unregisterCaller(contract2.address)).to.be.revertedWith('no registration');
    });

    it('unregistered', async function () {
      await registry.unregisterCaller(contract1.address);
      await expect(registry.unregisterCaller(contract1.address)).to.be.revertedWith('unregistered');
    });
  });

  describe('get info', function () {
    describe('handler', function () {
      beforeEach(async function () {
        await registry.register(contract1.address, info);
      });

      it('normal', async function () {
        const result = await registry.handlers(contract1.address);
        expect(result).eq(infoPaddedHex);
      });

      it('unregistered', async function () {
        await registry.unregister(contract1.address);
        const result = await registry.handlers(contract1.address);

        expect(result).eq(deprecatedPaddedHex);
      });
    });

    describe('caller', function () {
      beforeEach(async function () {
        await registry.registerCaller(contract1.address, info);
      });

      it('normal', async function () {
        const result = await registry.callers(contract1.address);
        expect(result).eq(infoPaddedHex);
      });

      it('unregistered', async function () {
        await registry.unregisterCaller(contract1.address);
        const result = await registry.callers(contract1.address);
        expect(result).eq(deprecatedPaddedHex);
      });
    });
  });

  describe('is valid', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
      await registry.registerCaller(contract2.address, info);
    });

    describe('handler', function () {
      it('normal', async function () {
        expect(await registry.isValidHandler(contract1.address)).to.be.eq(true);
      });

      it('wrong type', async function () {
        expect(await registry.isValidCaller(contract1.address)).to.be.eq(false);
      });

      it('removed', async function () {
        await registry.unregister(contract1.address);
        expect(await registry.isValidHandler(contract1.address)).to.be.eq(false);
      });
    });

    describe('caller', function () {
      it('normal', async function () {
        expect(await registry.isValidCaller(contract2.address)).to.be.eq(true);
      });

      it('wrong type', async function () {
        expect(await registry.isValidHandler(contract2.address)).to.be.eq(false);
      });

      it('removed', async function () {
        await registry.unregisterCaller(contract2.address);
        expect(await registry.isValidCaller(contract2.address)).to.eq(false);
      });
    });
  });

  describe('halt', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
      await registry.registerCaller(contract2.address, info);
    });

    it('normal', async function () {
      expect(await registry.fHalt()).to.be.eq(false);
      await expect(registry.halt()).to.emit(registry, 'Halted').withArgs();
      expect(await registry.fHalt()).to.be.eq(true);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).halt()).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('halted', async function () {
      await registry.halt();
      await expect(registry.halt()).to.be.revertedWith('Halted');
    });
  });

  describe('unhalt', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
      await registry.registerCaller(contract2.address, info);
      await registry.halt();
    });

    it('normal', async function () {
      expect(await registry.fHalt()).to.be.eq(true);
      await expect(registry.unhalt()).to.emit(registry, 'Unhalted').withArgs();
      expect(await registry.fHalt()).to.be.eq(false);
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).unhalt()).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('not halted', async function () {
      await registry.unhalt();
      await expect(registry.unhalt()).to.be.revertedWith('Not halted');
    });
  });

  describe('ban', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
      await registry.registerCaller(contract2.address, info);
    });

    it('normal', async function () {
      expect(await registry.bannedAgents(someone.address)).to.be.eq(ether('0'));

      await expect(registry.ban(someone.address)).to.emit(registry, 'Banned').withArgs(someone.address);

      expect(await registry.bannedAgents(someone.address)).to.be.not.eq(ether('0'));
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).ban(owner.address)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('banned', async function () {
      await registry.ban(someone.address);
      await expect(registry.ban(someone.address)).to.be.revertedWith('Banned');
    });
  });

  describe('unban', function () {
    beforeEach(async function () {
      await registry.register(contract1.address, info);
      await registry.registerCaller(contract2.address, info);
      await registry.ban(someone.address);
    });

    it('normal', async function () {
      expect(await registry.bannedAgents(someone.address)).to.be.not.eq(ether('0'));

      await expect(registry.unban(someone.address)).to.emit(registry, 'Unbanned').withArgs(someone.address);
      expect(await registry.bannedAgents(someone.address)).to.be.eq(ether('0'));
    });

    it('non owner', async function () {
      await expect(registry.connect(someone).unban(someone.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });

    it('not banned', async function () {
      await registry.unban(someone.address);
      await expect(registry.unban(someone.address)).to.be.revertedWith('Not banned');
    });
  });
});
