// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {FundProxy} from "./FundProxy.sol";
import {ShareToken} from "./ShareToken.sol";
import {IComptroller} from "./interfaces/IComptroller.sol";
import {IFund} from "./interfaces/IFund.sol";
import {IMortgageVault} from "./interfaces/IMortgageVault.sol";
import {Errors} from "./utils/Errors.sol";

contract FundProxyFactory {
    event FundCreated(address indexed newFund, address comptroller, address shareToken, address vault);

    IComptroller public comptroller;

    constructor(IComptroller comptroller_) {
        comptroller = comptroller_;
    }

    function createFund(
        IERC20Metadata denomination,
        uint256 level,
        uint256 mFeeRate,
        uint256 pFeeRate,
        uint256 crystallizationPeriod,
        uint256 reserveExecutionRate,
        string memory shareTokenName
    ) external returns (address) {
        Errors._require(comptroller.isValidCreator(msg.sender), Errors.Code.FUND_PROXY_FACTORY_INVALID_CREATOR);
        Errors._require(
            comptroller.isValidDenomination(address(denomination)),
            Errors.Code.FUND_PROXY_FACTORY_INVALID_DENOMINATION
        );
        IMortgageVault mortgageVault = comptroller.mortgageVault();
        (bool isMortgageTierSet, uint256 amount) = comptroller.mortgageTier(level);
        Errors._require(isMortgageTierSet, Errors.Code.FUND_PROXY_FACTORY_INVALID_MORTGAGE_TIER);
        // Can be customized
        ShareToken share = new ShareToken(shareTokenName, "FFST", denomination.decimals());
        bytes memory data = abi.encodeWithSignature(
            "initialize(uint256,address,address,address,uint256,uint256,uint256,uint256,address)",
            level,
            address(comptroller),
            address(denomination),
            address(share),
            mFeeRate,
            pFeeRate,
            crystallizationPeriod,
            reserveExecutionRate,
            msg.sender
        );

        IFund fund = IFund(address(new FundProxy(address(comptroller), data)));
        mortgageVault.mortgage(msg.sender, address(fund), amount);
        share.transferOwnership(address(fund));
        emit FundCreated(address(fund), address(comptroller), address(share), fund.vault());
        return address(fund);
    }
}
