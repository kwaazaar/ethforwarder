const Q = require('q');
const Web3 = require('web3');
const net = require('net');
const Request = require('request');
const BigNumber = require('bignumber.js');
const Config = require('./config.dev');

if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else {
    web3 = new Web3(new Web3.providers.IpcProvider('\\\\.\\pipe\\geth.ipc', net)); // local node
    //web3 = new Web3(new Web3.providers.HttpProvider(Config.rpcAddr));
}
const BN = web3.utils.BN;

var minBalance = web3.utils.toBN(Config.minBalance);
console.log(`Minimum balance: ${web3.utils.fromWei(Config.minBalance, "ether")} ETH`);

var subscription = web3.eth.subscribe('pendingTransactions', (err, res) => {
    console.log('callback', res, err);
})
.on ((tx) => {
    console.log(tx);
});

var account = web3.eth.accounts.privateKeyToAccount(Config.sourcePrivKey);
Q.all([
    web3.eth.getBalance(account.address)
        .then(balance => {
            console.log(`Source address (${account.address}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`);
        }),
    web3.eth.getBalance(Config.targetAddress)
        .then(balance => {
            console.log(`Target address (${Config.targetAddress}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`);
        })
])
    .then((result) => {

        //web.eth.filter
        var subscription = web3.eth.subscribe('pendingTransactions', (err, res) => {
            console.log('callback', res, err);
        })
        .on ((tx) => {
            console.log(tx);
        });
    })
    .catch((err) => {
        console.log(err);
    });