import { BigNumber, utils } from 'ethers';
import { assets } from './assets/AssetConfig';

export const MANAGEMENT = '0x64585922a9703d9EdE7d353a6522eb2970f75066';
export const EXEC_FEE_COLLECTOR = '0x3EBe4dfaF95cd320BF34633B3BDf773FbE732E63';
export const PENDING_LIQUIDATOR = '0xc9948CaB1eFD1AABa3A9d89719533C0aaee08bC4';
export const FUND_CREATORS = ['0xbEEd6F924c7B101a3EA8E4761385C366b35F1b7C'];
export const MORTGAGE_TOKEN = '0x6DdB31002abC64e1479Fc439692F7eA061e78165'; // COMBO
export const DS_PROXY_REGISTRY = '0x7B4C6A6EB4aF9435a62bfAB09Fd2074f7752A784';
export const AAVE_LENDING_POOL = '0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf';
export const AAVE_POOL_V3 = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
export const CURVE_AAVE_SWAP = '0x445FE580eF8d70FF569aB36e80c647af338db351';
export const CURVE_REN_SWAP = '0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67';
export const CURVE_ATRICRYPTO3_DEPOSIT = '0x1d8b86e3D88cDb2d34688e87E72F388Cb541B7C8';
export const CURVE_EURTUSD_DEPOSIT = '0x225FB4176f0E20CDb66b4a3DF70CA3063281E855';
export const WL_ANY_ADDRESS = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';
export const WL_ANY_SIG = '0xffffffff';
export const WL_AAVE_V2_SIGS = [
  '0x47e7ef24', // deposit(address,uint256)
  '0xf3fef3a3', // withdraw(address,uint256)
  '0x8cd2e0c7', // repay(address,uint256,uint256)
  '0xc1bce0b7', // borrow(address,uint256,uint256)
  '0x54296154', // flashLoan(address[],uint256[],uint256[],bytes)
];
export const WL_AAVE_V3_SIGS = [
  '0xf2b9fdb8', // supply(address,uint256)
  '0xf3fef3a3', // withdraw(address,uint256)
  '0x8cd2e0c7', // repay(address,uint256,uint256)
  '0xc1bce0b7', // borrow(address,uint256,uint256)
  '0x54296154', // flashLoan(address[],uint256[],uint256[],bytes)
];
export const WL_FUNDS_SIGS = [
  '0xde41691c', // updateTokens(address[])
  '0x0ce7df36', // addFunds(address[],uint256[])
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
export const WL_CURVE_SIGS = [
  '0xfef6074e', // exchangeUnderlying(address,address,address,int128,int128,uint256,uint256)
  '0x51c6312e', // exchangeUnderlyingUint256(address,address,address,uint256,uint256,uint256,uint256)
  '0x7ad0fd49', // addLiquidityUnderlying(address,address,address[],uint256[],uint256)
  '0xdf5f2889', // removeLiquidityOneCoinUnderlying(address,address,address,uint256,int128,uint256)
];
export const WL_PARASWAP_V5_SIGS = [
  '0x7f0f41d7', // swap(address,uint256,address,bytes)
];
export const WL_UNISWAP_V3_SIGS = [
  '0xa2608210', // exactInputSingle(address,address,uint24,uint256,uint256,uint160)
  '0xdf58a96f', // exactInput(bytes,uint256,uint256)
  '0xf900e577', // exactOutputSingle(address,address,uint24,uint256,uint256,uint160)
  '0x110cb594', // exactOutput(bytes,uint256,uint256)
];
export const LEVEL = 1;
export const LEVEL_AMOUNT = 0;
export const EXEC_FEE_PERCENTAGE = 20; // 0.2%
export const PENDING_EXPIRATION = 86400 * 3; // 3 days
export const VALUE_TOLERANCE = 9000; // 90%

export const denominations: Record<string, BigNumber> = {
  [assets.USDC]: utils.parseUnits('0.01', 6),
};

const func: any = async function () {};

export default func;
