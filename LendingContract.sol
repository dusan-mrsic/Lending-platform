// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "./LendLordToken.sol";

interface ILendLordToken {

    function balanceOf(address account) external view returns (uint256);
    
    function burn(address account, uint amount) external;

    function mint(address account, uint amount) external;

}

contract LendingContract is Ownable {

    uint256 public minDuration; // in days
    uint256 public maxDuration; // in days
    uint256 public minFee; // in percent
    uint256 public maxFee; // in percent
    uint256 public totalOverdraftEth;
    uint256 internal totalFeeEth;
    uint256 internal totalIds;
    uint256 public timestampLowerBound;
    uint256 internal timestampUpperBound;
    ILendLordToken public token;

    enum State {INITIAL, BORROWED, RETURNED, OVERDRAFTED}

    mapping(address => Customer) customers;
    mapping(uint256 => address) customersIds;

    struct Customer {
        uint256 borrowAmount;
        uint256 fee;
        uint256 duration;
        uint256 claimAvailableTimestamp;
        uint256 eth;
        uint256 longestAvailableReturn;
        State state;
    }

    modifier onlyBorrowed() { 
        require(customers[msg.sender].state == State.BORROWED, "Only for customer who borrowed tokens!");
        _;
    }

    modifier onlyReturened() {
        require(customers[msg.sender].state == State.RETURNED, "Only for customer who returned tokens!");
        _;
    }

    modifier availableClaim() {
        require(customers[msg.sender].claimAvailableTimestamp < block.timestamp, "Calim not available yet!");
        _;
    }

    constructor(
        uint256 _minDuration,
        uint256 _maxDuration,
        uint256 _minFee,
        uint256 _maxFee,
        ILendLordToken _token
    ) {
        minDuration = _minDuration;
        maxDuration = _maxDuration;
        minFee = _minFee;
        maxFee = _maxFee;
        totalIds = 0;
        timestampLowerBound = 0;
        timestampUpperBound = 0;
        token = _token;
    }



    function borrowTokens(uint256 _durationDays) external payable {
        uint256 borrowAmount = msg.value * 100;
        uint256 claimAvailableTimestamp = block.timestamp + _durationDays * 1 days; // time when customer can claim eth after returning LL tokens
        uint256 longestAvailableReturn = block.timestamp + (_durationDays + _durationDays / 2) * 1 days; // time with overdraft
        uint256 fee = minFee + (maxFee - minFee) / (maxDuration - minDuration) * (maxDuration - _durationDays);
        token.mint(msg.sender, borrowAmount);
        customers[msg.sender] = Customer(borrowAmount, fee, _durationDays, claimAvailableTimestamp, msg.value, longestAvailableReturn, State.BORROWED);
        customersIds[totalIds] = msg.sender;
        totalIds++;
    }

    function returnTokens() external onlyBorrowed {
        Customer storage customer = customers[msg.sender];
        uint256 feeInEth = 0;
        if(block.timestamp < customer.claimAvailableTimestamp) {
            feeInEth = customer.eth * customer.fee / 100;
        }else if(block.timestamp < customer.longestAvailableReturn) {
            uint256 overdraftFee = customer.fee + maxFee * ((block.timestamp - customer.claimAvailableTimestamp) / 1 days);
            feeInEth = customer.eth * overdraftFee / 100;
        }else {
            totalOverdraftEth += customer.eth;
            delete customers[msg.sender];
            return;
        }
        customer.eth -= feeInEth;
        totalFeeEth += feeInEth;
        customer.state = State.RETURNED;
        token.burn(msg.sender, customer.borrowAmount);

    }

    function withdrawEth() external onlyReturened availableClaim {
        payable(msg.sender).transfer(customers[msg.sender].eth);
        delete customers[msg.sender];
    }

    function withdrawFeeContractEth() external onlyOwner {
        payable(owner()).transfer(totalFeeEth);
        totalFeeEth = 0;
    }

    function withdrawOverdraftContractEth() external onlyOwner {
        timestampUpperBound = block.timestamp;
        (uint256 overdraftEth, uint256 lowerBound) = calculateOverdraft();
        totalOverdraftEth += overdraftEth;
        timestampLowerBound = lowerBound;
        token.burn(owner(), totalOverdraftEth * 100);
        payable(owner()).transfer(totalOverdraftEth);
        totalOverdraftEth = 0;
    }

    function calculateOverdraft() internal view onlyOwner returns (uint256, uint256) {
        uint256 maxLowerTimestamp = timestampLowerBound;
        uint256 overdraftTokens = 0;
        for(uint i = 0; i < totalIds; i++) {
            address customerAddr = customersIds[i];
            Customer memory customer = customers[customerAddr];
            if(customer.longestAvailableReturn > timestampLowerBound && customer.longestAvailableReturn < timestampUpperBound && customer.state == State.BORROWED) {
                if(customer.longestAvailableReturn > maxLowerTimestamp) maxLowerTimestamp = customer.longestAvailableReturn;
                overdraftTokens += customer.eth;
                customer.eth = 0;
                customer.state = State.OVERDRAFTED;
            }
        }
        return (overdraftTokens, maxLowerTimestamp);
    }

}