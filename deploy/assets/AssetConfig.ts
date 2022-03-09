export const assets: Record<string, string> = {
  DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
  USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
  WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
  LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
  WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  CRV: '0x172370d5Cd63279eFa6d502DAB29171933a610AF',
  DPI: '0x85955046DF4668e1DD369D2DE9f3AEB98DD2A369',
  FRAX: '0x104592a158490a9228070E0A8e5343B499e125D0',
  FXS: '0x1a3acf6D19267E2d3e7f898f42803e90C9219062',
  GHST: '0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7',
  GRT: '0x5fe2B58c013d7601147DcdD68C143A77499f5531',
  NEXO: '0x41b3966B4FF7b427969ddf5da3627d6AEAE9a48E',
  QUICK: '0x831753DD7087CaC61aB5644b308642cc1c33Dc13',
  SNX: '0x50B728D8D964fd00C2d0AAD81718b71311feF68a',
  SOL: '0x7DfF46370e9eA5f0Bad3C4E29711aD50062EA7A4',
  SUSHI: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
  UNI: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f',
};

export const chainlinkAggregators: Record<string, string> = {
  [assets.DAI]: '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D',
  [assets.USDC]: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
  [assets.USDT]: '0x0A6513e40db6EB1b165753AD52E80663aeA50545',
  [assets.WBTC]: '0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6',
  [assets.WETH]: '0xF9680D99D6C9589e2a93a78A04A279e509205945',
  [assets.AAVE]: '0x72484B12719E23115761D5DA1646945632979bB6',
  [assets.LINK]: '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665',
  [assets.WMATIC]: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  [assets.CRV]: '0x336584C8E6Dc19637A5b36206B1c79923111b405',
  [assets.DPI]: '0x2e48b7924FBe04d575BA229A59b64547d9da16e9',
  [assets.FRAX]: '0x00DBeB1e45485d53DF7C2F0dF1Aa0b6Dc30311d3',
  [assets.FXS]: '0x6C0fe985D3cAcbCdE428b84fc9431792694d0f51',
  [assets.GHST]: '0xDD229Ce42f11D8Ee7fFf29bDB71C7b81352e11be',
  [assets.GRT]: '0x3FabBfb300B1e2D7c9B84512fe9D30aeDF24C410',
  [assets.NEXO]: '0x666bb13b3ED3816504E8c30D0F9B9C16b371774b',
  [assets.QUICK]: '0xa058689f4bCa95208bba3F265674AE95dED75B6D',
  [assets.SNX]: '0xbF90A5D9B6EE9019028dbFc2a9E50056d5252894',
  [assets.SOL]: '0x10C8264C0935b3B9870013e057f330Ff3e9C56dC',
  [assets.SUSHI]: '0x49B0c695039243BBfEb8EcD054EB70061fd54aa0',
  [assets.UNI]: '0xdf0Fb4e4F928d2dCB76f438575fDD8682386e13C',
};

export const aaveV2Asset: Record<string, string> = {
  amAAVE: '0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360',
  amDAI: '0x27F8D03b3a2196956ED754baDc28D73be8830A6e',
  amUSDC: '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F',
  amUSDT: '0x60D55F02A771d515e077c9C2403a1ef324885CeC',
  amWBTC: '0x5c2ed810328349100A66B82b78a1791B101C9D61',
  amWETH: '0x28424507fefb6f7f8E9D3860F56504E4e5f5f390',
  amWMATIC: '0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4',
};

export const aaveV2Debt: Record<string, string> = {
  stableDebtmAAVE: '0x17912140e780B29Ba01381F088f21E8d75F954F9',
  stableDebtmDAI: '0x2238101B7014C279aaF6b408A284E49cDBd5DB55',
  stableDebtmUSDC: '0xdeb05676dB0DB85cecafE8933c903466Bf20C572',
  stableDebtmUSDT: '0xe590cfca10e81FeD9B0e4496381f02256f5d2f61',
  stableDebtmWBTC: '0x2551B15dB740dB8348bFaDFe06830210eC2c2F13',
  stableDebtmWETH: '0xc478cBbeB590C76b01ce658f8C4dda04f30e2C6f',
  stableDebtmWMATIC: '0xb9A6E29fB540C5F1243ef643EB39b0AcbC2e68E3',
  variableDebtmAAVE: '0x1c313e9d0d826662F5CE692134D938656F681350',
  variableDebtmDAI: '0x75c4d1Fb84429023170086f06E682DcbBF537b7d',
  variableDebtmUSDC: '0x248960A9d75EdFa3de94F7193eae3161Eb349a12',
  variableDebtmUSDT: '0x8038857FD47108A07d1f6Bf652ef1cBeC279A2f3',
  variableDebtmWBTC: '0xF664F50631A6f0D72ecdaa0e49b0c019Fa72a8dC',
  variableDebtmWETH: '0xeDe17e9d79fc6f9fF9250D9EEfbdB88Cc18038b5',
  variableDebtmWMATIC: '0x59e8E9100cbfCBCBAdf86b9279fa61526bBB8765',
};

export const curveStable: Record<string, any> = {
  am3CRV: {
    address: '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
    pool: '0x445FE580eF8d70FF569aB36e80c647af338db351', // CURVE_AAVE_SWAP
    valuedAsset: assets.USDC,
    valuedAssetDecimals: 6,
  },
};

export const quickSwap: Record<string, string> = {
  'quickDAI-USDT': '0x59153f27eeFE07E5eCE4f9304EBBa1DA6F53CA88',
  'quickGHST-WETH': '0xcCB9d2100037f1253e6C1682AdF7dC9944498AFF',
  'quickLINK-WETH': '0x5cA6CA6c3709E1E6CFe74a50Cf6B2B6BA2Dadd67',
  'quickMATIC-QUICK': '0x019ba0325f1988213D448b3472fA1cf8D07618d7',
  'quickMATIC-SOL': '0x898386DD8756779a4ba4f1462891B92dd76b78eF',
  'quickMATIC-USDC': '0x6e7a5FAFcec6BB1e78bAE2A1F0B612012BF14827',
  'quickMATIC-WETH': '0xadbF1854e5883eB8aa7BAf50705338739e558E5b',
  'quickNEXO-WETH': '0x10062ec62C0bE26cC9e2f50a1CF784a89ded075F',
  'quickUSDC-DAI': '0xf04adBF75cDFc5eD26eeA4bbbb991DB002036Bdd',
  'quickUSDC-GHST': '0x096C5CCb33cFc5732Bcd1f3195C13dBeFC4c82f4',
  'quickUSDC-QUICK': '0x1F1E4c845183EF6d50E9609F16f6f9cAE43BC9Cb',
  'quickUSDC-USDT': '0x2cF7252e74036d1Da831d11089D326296e64a728',
  'quickUSDC-WETH': '0x853Ee4b2A13f8a742d64C8F088bE7bA2131f670d',
  'quickWBTC-USDC': '0xF6a637525402643B0654a54bEAd2Cb9A83C8B498',
  'quickWBTC-WETH': '0xdC9232E2Df177d7a12FdFf6EcBAb114E2231198D',
  'quickWETH-AAVE': '0x90bc3E68Ba8393a3Bf2D79309365089975341a43',
  'quickWETH-DAI': '0x4A35582a710E1F4b2030A3F826DA20BfB6703C09',
  'quickWETH-DPI': '0x9F77Ef7175032867d26E75D2fA267A6299E3fb57',
  'quickWETH-QUICK': '0x1Bd06B96dd42AdA85fDd0795f3B4A79DB914ADD5',
  'quickWETH-UNI': '0xF7135272a5584Eb116f5a77425118a8B4A2ddfDb',
  'quickWETH-USDT': '0xF6422B997c7F54D1c6a6e103bcb1499EeA0a7046',
};

export const sushiSwap: Record<string, string> = {
  'sushiCRV-WETH': '0x396E655C309676cAF0acf4607a868e0CDed876dB',
  'sushiFRAX-USDC': '0x9e20a8d3501BF96EDA8e69b96DD84840058a1cB0',
  'sushiFXS-USDC': '0xF850c261AdC576E6713D14af590a40d55936a982',
  'sushiGRT-WETH': '0x1cedA73C034218255F50eF8a2c282E6B4c301d60',
  'sushiLINK-WETH': '0x74D23F21F780CA26B47Db16B0504F2e3832b9321',
  'sushiMATIC-USDC': '0xcd353F79d9FADe311fC3119B841e1f456b54e858',
  'sushiMATIC-WETH': '0xc4e595acDD7d12feC385E5dA5D43160e8A0bAC0E',
  'sushiSNX-WETH': '0x116Ff0d1Caa91a6b94276b3471f33dbeB52073E7',
  'sushiSUSHI-WETH': '0xb5846453B67d0B4b4Ce655930Cf6E4129F4416D7',
  'sushiUSDC-DAI': '0xCD578F016888B57F1b1e3f887f392F0159E26747',
  'sushiUSDC-USDT': '0x4B1F1e2435A9C96f7330FAea190Ef6A7C8D70001',
  'sushiUSDC-WETH': '0x34965ba0ac2451A34a0471F04CCa3F990b8dea27',
  'sushiWBTC-WETH': '0xE62Ec2e799305E0D367b0Cc3ee2CdA135bF89816',
  'sushiWETH-AAVE': '0x2813D43463C374a680f235c428FB1D7f08dE0B69',
  'sushiWETH-DAI': '0x6FF62bfb8c12109E8000935A6De54daD83a4f39f',
  'sushiWETH-USDT': '0xc2755915a85C6f6c1C0F3a86ac8C058F11Caa9C9',
};

const func: any = async function () {};

export default func;