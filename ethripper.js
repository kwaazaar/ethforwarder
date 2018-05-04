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
}
const BN = web3.utils.BN;

var minBalance = web3.utils.toBN(Config.minBalance);
console.log(`Minimum balance: ${web3.utils.fromWei(Config.minBalance, "ether")} ETH`);

var account = web3.eth.accounts.privateKeyToAccount(Config.sourcePrivKey);
var chainId = 1;

Q.all([
    web3.eth.getBalance(account.address)
        .then(balance => {
            console.log(`Source address (${account.address}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`);
        }),
    web3.eth.getBalance(Config.targetAddress)
        .then(balance => {
            console.log(`Target address (${Config.targetAddress}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`);
        }),
    web3.eth.net.getId()
        .then((id) => chainId = id)
])
    .then((result) => {
        console.log(`Current network id: ${chainId}`);
        var subscription = web3.eth.subscribe('pendingTransactions')
            .on("data", (txHash) => {
                web3.eth.getTransaction(txHash)
                    .then((tx) => {
                        //console.log(tx);
                        if ((tx.to) && (tx.to.toUpperCase() === account.address.toUpperCase())) {
                            console.log(`Tx found to ${account.address}:`, tx);

                            web3.eth.getTransactionCount(account.address, "pending")
                                .then((count) => {

                                    var bnValue = web3.utils.toBN(tx.value);
                                    var gas = tx.gas * 3;
                                    var gasPrice = tx.gasPrice * 2;
                                    var totalGas = gas * gasPrice;
                                    var bnTotalGas = web3.utils.toBN(totalGas);
                                    var bnValueToSend = bnValue.sub(bnTotalGas);

                                    console.log(`Incoming value: ${web3.utils.fromWei(bnValue, "ether")} ETH`);
                                    console.log(`Incoming gas:   ${tx.gas * tx.gasPrice}`);
                                    console.log(`Outgoing value: ${web3.utils.fromWei(bnValueToSend, "ether")} ETH`);
                                    console.log(`Outgoing gas:   ${totalGas}`);

                                    if (bnValueToSend.isNeg()) {
                                        gas = tx.gas;
                                        gasPrice = 21000;
                                        totalGas = gas * gasPrice;
                                        bnTotalGas = web3.utils.toBN(totalGas);
                                        bnValueToSend = bnValue.sub(bnTotalGas);
                                    }

                                    if (!bnValueToSend.isNeg()) {

                                        var txTarget = {
                                            chainId: chainId,
                                            to: Config.targetAddress,
                                            value: bnValueToSend,
                                            gas: gas,
                                            gasPrice: gasPrice,
                                            nonce: count + 1
                                        };
                                        console.log(txTarget);
                                        return web3.eth.accounts.signTransaction(txTarget, Config.sourcePrivKey)
                                            .then((res) => {
                                                return web3.eth.sendSignedTransaction(res.rawTransaction)
                                                    .then((txReceipt) => {
                                                        console.log(`Successfully moved ${web3.utils.fromWei(valueToSend, "ether")} ETH (tx:${txReceipt.transactionHash})`);
                                                    })
                                                    .catch((err) => {
                                                        console.error(`Failed to send tx ${res.messageHash}:`);
                                                        throw err; // err itself is logged in outer catch
                                                    });
                                            });
                                    }
                                    else {
                                        console.log(`Value ${bnValue} too small to send`);
                                    }
                                });
                        }
                    })
                    .catch(err => {
                        console.error('***', err);
                    });
            });

        console.log('Running, press CTRL-C to quit...');

    })
    .catch((err) => {
        console.error('Cannot get balances', err);
    });
