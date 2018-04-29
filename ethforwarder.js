const Q = require('q');
const Web3 = require('web3');
const Request = require('request');
const BigNumber = require('bignumber.js');
const Config = require('./config.dev');

if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else {
    web3 = new Web3(new Web3.providers.HttpProvider(Config.rpcAddr));
}
const BN = web3.utils.BN;

var minBalance = web3.utils.toBN(Config.minBalance);
console.log(`Minimum balance: ${web3.utils.fromWei(Config.minBalance, "ether")} ETH`);

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


        var lastBlock = 0;
        var lastBalance = 0;
        unconfirmedTx = [];

        function doLoop(restart) {
            // New block?
            // - LastBlock = blockNr
            // - LastTxUnconfirmed && block.tx.contains(lastTx)
            // - - LastTxUnconfirmed = 0;
            // - Balance > 0
            // - - Make Tx https://github.com/kwaazaar/ethforwarder.git

            // web3.eth.defaultBlock
            web3.eth.getBlock('latest')
                .then((res) => {
                    if (res.number > lastBlock) {
                        lastBlock = res.number;

                        return web3.eth.getBalance(account.address)
                            .then((balance) => {

                                // Show balance changes
                                if (balance !== lastBalance) {
                                    console.log(`Block ${lastBlock}: ${web3.utils.fromWei(web3.utils.toBN(balance), "ether")} ETH found`);
                                    lastBalance = balance;
                                }

                                var bnBalance = web3.utils.toBN(balance);
                                if (bnBalance.gte(minBalance)) {

                                    return web3.eth.getGasPrice()
                                        .then((price) => {
                                            var gasPrice = web3.utils.toBN(price).mul(web3.utils.toBN(3)); // 3x normal gas to get preference

                                            var maxGas = web3.utils.toBN(21000);
                                            var totalGas = gasPrice.mul(maxGas);

                                            var valueToSend = bnBalance.sub(totalGas);

                                            if (valueToSend.gte(minBalance)) {
                                                var tx = {
                                                    to: Config.targetAddress,
                                                    value: valueToSend,
                                                    gas: maxGas,
                                                    gasPrice: gasPrice
                                                };
                                                return web3.eth.accounts.signTransaction(tx, Config.sourcePrivKey)
                                                    .then((res) => {
                                                        return web3.eth.sendSignedTransaction(res.rawTransaction)
                                                            .then((txReceipt) => {
                                                                unconfirmedTx.push(txReceipt.transactionHash);
                                                                console.log(`Successfully moved ${web3.utils.fromWei(valueToSend, "ether")} ETH (tx:${txReceipt.transactionHash})`);
                                                            })
                                                            .catch((err) => {
                                                                console.error(`Failed to send tx ${res.messageHash}:`);
                                                                throw err; // err itself is logged in outer catch
                                                            });
                                                    });
                                            }
                                        });
                                }
                            })
                    }

                })
                .then(() => {
                    if (restart) restart();
                })
                .catch(err => {
                    console.error('***', err);
                    if (restart) restart();
                });
        }

        function restartLoop() {
            setTimeout(doLoop, 1000, restartLoop);
        }

        console.log('Running, press CTRL-C to quit...');
        restartLoop();

    })
    .catch((err) => {
        console.error('Cannot get balances', err);
    });
