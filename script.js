const fs = require("fs");
const { utils } = require("ethers");
const config = require("../scripts/shared/constants.js");
const { secondsSinceEpoch }  = require("../scripts/shared/helpers.js");
const { deploy } = require("../scripts/deployOne.js");
const { getInputData } = require("../scripts/testlib.js");
const  Web3  = require("web3");

const deployLendLordTokenContract = async() => {
    console.log("Deploying 'LendLord Token' contract...");
    let tokenContractArgs = [];
    let tokenContract = await deploy(config.deployer2PrivateKey, "LendLordToken", tokenContractArgs, config.RINKEBY_NODE_ADDRESS);
    console.log("Deploying 'LendLord Token' finished!");
    return tokenContract.contractAddress;
}

const deployLendingContract = async(lendlordTokenAddr) => {
    console.log("Deploying 'Lending' contract...");
    let tokenContractArgs = [0, 7, 2, 10, lendlordTokenAddr];
    let tokenContract = await deploy(config.deployer2PrivateKey, "LendingContract", tokenContractArgs, config.RINKEBY_NODE_ADDRESS);
    console.log("Deploying 'Lending' finished!");
    return tokenContract.contractAddress;
}

const deployContracts = async() => {
    const lendlordTokenAddr = await deployLendLordTokenContract();
    const lendingContractAddr = await deployLendingContract(lendlordTokenAddr);
    return {lendlordTokenAddr, lendingContractAddr};
}

const getContractABI = (contract) => {
    const contractPath = "../build/contracts/" + contract + ".json";
    const contractJSON = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    return contractJSON["abi"];
}

function makeTransactionObject(web3, from, to, stateChangeData, amount = 0) {
    return {
        from: from,
        to: to,
        gasLimit: web3.utils.toHex(6000000),
        gasPrice: web3.utils.toHex(web3.utils.toWei('2', 'gwei')),
        data: stateChangeData,
        value: amount,
    };
}

async function sendTransaction(web3, txObject, privateKey) {
    try {
        const signed = await web3.eth.accounts.signTransaction(txObject, privateKey);
        let tx = await web3.eth.sendSignedTransaction(signed.rawTransaction);
        return tx.transactionHash;
    } catch(err) {
        console.log(err);
    }
}

async function performTransaction(web3, contract, functionName, args, fromAddress, privateKey, amount = 0) {
    const stateChangeData = contract.methods[functionName](...args).encodeABI();
    const txObject = makeTransactionObject(web3, fromAddress, contract._address, stateChangeData, amount);
    const txHash = await sendTransaction(web3, txObject, privateKey);
    console.log(`performing ${functionName} ${txHash} `);
    return txHash;
}

async function withdrawOverdraftedTokens(web3, lendingContract) {
    const res = await lendingContract.methods.calculateOverdraft().call({from: config.deployer2Address});
    console.log("amount: " + res[0]);
    console.log("timestamp: " + res[1]);
    let amount = (res[0] / (10**18)).toString();
    await performTransaction(web3, lendingContract, "setTimestampLowerBound", [res[1]], config.deployer2Address, config.deployer2PrivateKey);
    await performTransaction(web3, lendingContract, "withdrawOverdraftContractEth", [utils.parseEther(amount)], config.deployer2Address, config.deployer2PrivateKey);

}

const simulateLending = async(tokenContractAddr, lendingContractAddr) => {
    let web3 = new Web3(config.RINKEBY_NODE_ADDRESS);
    const tokenABI = getContractABI("LendLordToken");
    const tokenContract = new web3.eth.Contract(tokenABI, tokenContractAddr);
    const lendingABI = getContractABI("LendingContract");
    const lendingContract = new web3.eth.Contract(lendingABI, lendingContractAddr);

    // borrow tokens acc1
    await performTransaction(web3, lendingContract, "borrowTokens", [0], config.razerAdminAddress, config.razerAdminPrivateKey, utils.parseEther("0.001"));
    // borrow tokens acc2
    await performTransaction(web3, lendingContract, "borrowTokens", [0], config.projectAdminAddress, config.projectAdminPrivateKey, utils.parseEther("0.005"));
    // withdraw overdrafted Tokens
    withdrawOverdraftedTokens(web3, lendingContract);
}

const deployAndSimulate = async() => {
    let {tokenContractAddr, lendingContractAddr} = await deployContracts();
    simulateLending(tokenContractAddr, lendingContractAddr);
}

deployAndSimulate();