// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../Implementation.sol";

contract ProxyMock is Implementation {
    constructor(
        IDSProxyRegistry dsProxyRegistry_,
        string memory name_,
        string memory symbol_
    ) Implementation(dsProxyRegistry_, name_, symbol_) {
        initializeDSProxy();
    }

    function getLevel() external pure returns (uint256) {
        return 1;
    }

    function execute(address _target, bytes calldata _data)
        external
        payable
        onlyOwner
    {
        vault.execute{value: msg.value}(_target, _data);
    }
}
