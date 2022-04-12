// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import {Chainlink} from "../../assets/oracles/Chainlink.sol";

contract ChainlinkAggregatorV3Mock {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {}
}
