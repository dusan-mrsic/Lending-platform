const fs = require("fs");
const { utils } = require("ethers");
const config = require("../scripts/shared/constants.js");
const { secondsSinceEpoch, sleep }  = require("../scripts/shared/helpers.js");
const { deploy } = require("../scripts/deployOne.js");
const { getInputData } = require("../scripts/testlib.js");
const  Web3  = require("web3");
const color = require("./color");

const deployLendLordTokenContract = async() => {
    color.log("<g>Deploying 'LendLord Token' contract...");
    let tokenContractArgs = [];
    let tokenContract = await deploy(config.deployer2PrivateKey, "LendLordToken", tokenContractArgs, config.RINKEBY_NODE_ADDRESS);
    color.log("<g>Deploying 'LendLord Token' contract finished!");
    return tokenContract.contractAddress;

    //0x4f18f06E3B93729A663ED886eEFC5AEeFF44bDBc
}

const deployLendingContract = async(lendlordTokenAddr) => {
    color.log("<g>Deploying 'Lending' contract...");
    let tokenContractArgs = [0, 7, 2, 10, lendlordTokenAddr];
    let tokenContract = await deploy(config.deployer2PrivateKey, "LendingContract", tokenContractArgs, config.RINKEBY_NODE_ADDRESS);
    color.log("<g>Deploying 'Lending' contract finished!");
    return tokenContract.contractAddress;

    //0x3027d0c8790DcD2BeaBE7F048F72e78469d30bb0
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
        color.log(`<y>Gas used: ${tx.gasUsed}`)
        return tx.transactionHash;
    } catch(err) {
        color.log(`<r>${err}`);
    }
}

async function performTransaction(web3, contract, functionName, args, fromAddress, privateKey, amount = 0) {
    const stateChangeData = contract.methods[functionName](...args).encodeABI();
    const txObject = makeTransactionObject(web3, fromAddress, contract._address, stateChangeData, amount);
    const txHash = await sendTransaction(web3, txObject, privateKey);
    color.log(`<b>performing ${functionName} ${txHash} `);
    return txHash;
}

async function withdrawOverdraftedTokens(web3, lendingContract) {
    const res = await lendingContract.methods.calculateOverdraft().call({from: config.deployer2Address});
    let amount = (res[0] / (10**18)).toString();
    await performTransaction(web3, lendingContract, "setTimestampLowerBound", [res[1]], config.deployer2Address, config.deployer2PrivateKey);
    await performTransaction(web3, lendingContract, "withdrawOverdraftContractEth", [utils.parseEther(amount)], config.deployer2Address, config.deployer2PrivateKey);
}

const simulateLending = async(tokenContractAddr, lendingContractAddr) => {
    //tokenContractAddr = ;
    //lendingContractAddr = ;
    let web3 = new Web3(config.RINKEBY_NODE_ADDRESS);
    const tokenABI = getContractABI("LendLordToken");
    const tokenContract = new web3.eth.Contract(tokenABI, tokenContractAddr);
    const lendingABI = getContractABI("LendingContract");
    const lendingContract = new web3.eth.Contract(lendingABI, lendingContractAddr);

    // borrow tokens acc1 for 3 minutes
    await performTransaction(web3, lendingContract, "borrowTokens", [3], config.razerAdminAddress, config.razerAdminPrivateKey, utils.parseEther("0.001"));
    // borrow tokens acc2 for 1 minute
    await performTransaction(web3, lendingContract, "borrowTokens", [1], config.projectAdminAddress, config.projectAdminPrivateKey, utils.parseEther("0.005"));
    // borrow tokens acc3 for 0 minutes (user is already overdrafted)
    await performTransaction(web3, lendingContract, "borrowTokens", [0], config.assetManagerAddress, config.assetManagerPrivateKey, utils.parseEther("0.004"));
    // make return request acc2
    await performTransaction(web3, lendingContract, "returnTokens", [], config.projectAdminAddress, config.projectAdminPrivateKey);
    // claim eth acc2
    await sleep(60);
    await performTransaction(web3, lendingContract, "withdrawEth", [], config.projectAdminAddress, config.projectAdminPrivateKey);
    // withdraw overdrafted Tokens
    withdrawOverdraftedTokens(web3, lendingContract);
    // sleep 2 minutes then withdraw tokens of acc1
    await sleep(120);
    withdrawOverdraftedTokens(web3, lendingContract);
}

const deployAndSimulate = async() => {
    let {tokenContractAddr, lendingContractAddr} = await deployContracts();
    simulateLending(tokenContractAddr, lendingContractAddr);
}

deployAndSimulate();