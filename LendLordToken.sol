// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LendLordToken is ERC20, Ownable {

    constructor() ERC20("LendLord", "$LL") {
        _mint(msg.sender, 9000000000000000000000);
    }

    function mint(address account, uint amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint amount) external {
        _burn(account, amount);
    }

}