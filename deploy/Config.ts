import { BigNumber, utils } from 'ethers';
import { assets } from './assets/AssetConfig';

export const MORTGAGE_TOKEN = '0x6DdB31002abC64e1479Fc439692F7eA061e78165'; // COMBO
export const DS_PROXY_REGISTRY = '0xD6DF5BC8f4834C4e3b9c6a79E99C41622d377aFB';
export const AAVE_LENDING_POOL = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf';
export const FURUCOMBO_HCURVE = '0xf0830115E60e11e02E980B063c3E88FcFDA598d1';
export const WL_ANY_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';
export const WL_ANY_SIG = '0xffffffff';
export const WL_AAVE_V2_SIGS = [
  '0x47e7ef24', // deposit(address,uint256)
  '0xf3fef3a3', // withdraw(address,uint256)
  '0x8cd2e0c7', // repay(address,uint256,uint256)
  '0xc1bce0b7', // borrow(address,uint256,uint256)
  '0x54296154', // flashLoan(address[],uint256[],uint256[],bytes)
  '0x920f5c84', // executeOperation(address[],uint256[],uint256[],address,bytes)
];
export const WL_FUNDS_SIGS = [
  '0xd0797f84', // inject(address[],uint256[])
  '0xb3e38f16', // returnFunds(address[],uint256[])
  '0xdb71410e', // checkSlippage(address[],uint256[])
];
export const WL_QUICKSWAP_SIGS = [
  '0x3351733f', // addLiquidity(address,address,uint256,uint256,uint256,uint256)
  '0xe2dc85dc', // removeLiquidity(address,address,uint256,uint256,uint256)
  '0x86818f26', // swapExactTokensForTokens(uint256,uint256,address[])
  '0x397d4b4a', // swapTokensForExactTokens(uint256,uint256,address[])
];
export const WL_SUSHISWAP_SIGS = [
  '0x3351733f', // addLiquidity(address,address,uint256,uint256,uint256,uint256)
  '0xe2dc85dc', // removeLiquidity(address,address,uint256,uint256,uint256)
  '0x86818f26', // swapExactTokensForTokens(uint256,uint256,address[])
  '0x397d4b4a', // swapTokensForExactTokens(uint256,uint256,address[])
];
export const LEVEL = 1;
export const EXEC_FEE_PERCENTAGE = 200; // 2%
export const PENDING_EXPIRATION = 86400; // 1 day
export const VALUE_TOLERANCE = 9000; // 90%

export const denominations: Record<string, BigNumber> = {
  [assets.USDC]: utils.parseUnits('0.01', 6),
};

const func: any = async function () {};

export default func;
