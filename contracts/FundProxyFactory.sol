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
    mapping(address => bool) public isFundCreated;

    constructor(IComptroller comptroller_) {
        comptroller = comptroller_;
    }

    function createFund(
        IERC20Metadata denomination_,
        uint256 level_,
        uint256 mFeeRate_,
        uint256 pFeeRate_,
        uint256 crystallizationPeriod_,
        uint256 reserveExecutionRate_,
        string memory shareTokenName_
    ) external returns (address) {
        Errors._require(comptroller.isValidCreator(msg.sender), Errors.Code.FUND_PROXY_FACTORY_INVALID_CREATOR);
        Errors._require(
            comptroller.isValidDenomination(address(denomination_)),
            Errors.Code.FUND_PROXY_FACTORY_INVALID_DENOMINATION
        );
        (bool isMortgageTierSet, ) = comptroller.mortgageTier(level_);
        Errors._require(isMortgageTierSet, Errors.Code.FUND_PROXY_FACTORY_INVALID_MORTGAGE_TIER);
        // Can be customized
        ShareToken share = new ShareToken(shareTokenName_, "FFST", denomination_.decimals());
        bytes memory data = abi.encodeWithSignature(
            "initialize(uint256,address,address,address,uint256,uint256,uint256,uint256,address)",
            level_,
            address(comptroller),
            address(denomination_),
            address(share),
            mFeeRate_,
            pFeeRate_,
            crystallizationPeriod_,
            reserveExecutionRate_,
            msg.sender
        );

        address fund = address(new FundProxy(address(comptroller), data));
        share.transferOwnership(fund);
        isFundCreated[fund] = true;

        emit FundCreated(fund, address(comptroller), address(share), IFund(fund).vault());

        return fund;
    }
}
