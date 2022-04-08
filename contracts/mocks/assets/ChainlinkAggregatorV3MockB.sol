// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ChainlinkAggregatorV3MockB {
    bool public isRevert;

    function revertOn() external {
        isRevert = true;
    }

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
    {
        roundId;
        answer = 1000;
        startedAt;
        updatedAt = block.timestamp;
        answeredInRound;
        require(!isRevert, "get price from oracle error");
    }
}
