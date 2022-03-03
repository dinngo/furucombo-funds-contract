import { BigNumber, utils } from 'ethers';
import { assets } from './assets/AssetConfig';

export const MORTGAGE_TOKEN = '0x6DdB31002abC64e1479Fc439692F7eA061e78165'; // COMBO
export const DS_PROXY_REGISTRY = '0xD6DF5BC8f4834C4e3b9c6a79E99C41622d377aFB';
export const AAVE_LENDING_POOL = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf';
export const FURUCOMBO_HCURVE = '0xf0830115E60e11e02E980B063c3E88FcFDA598d1';
export const WL_ANY_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';
export const WL_ANY_SIG = '0xffffffff';
export const LEVEL = 1;
export const EXEC_FEE_PERCENTAGE = 200; // 2%
export const PENDING_EXPIRATION = 86400; // 1 day

export const denominations: Record<string, BigNumber> = {
  [assets.USDC]: utils.parseUnits('0.01', 6),
};

const func: any = async function () {};

export default func;
