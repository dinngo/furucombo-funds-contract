pragma solidity ^0.8.0;

interface IMRC20 {
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 value)
        external
        payable
        returns (bool);
}
