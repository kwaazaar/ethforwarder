const Q = require('q');
const Web3 = require('web3');
const net = require('net');
const Request = require('request');
const BigNumber = require('bignumber.js');

var configFile = './config';
if (process.argv.length >= 3) { configFile = process.argv[2] }
const Config = require(configFile);

if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else if (Config.ipcAddr) {
    web3 = new Web3(new Web3.providers.IpcProvider(Config.ipcAddr, net)); // local node
}
else {
    web3 = new Web3(new Web3.providers.HttpProvider(Config.rpcAddr));
}
const BN = web3.utils.BN;
var chainId = 1;

var minBalance = web3.utils.toBN(Config.minBalance); // is in wei

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
        }),
    web3.eth.net.getId()
        .then((id) => chainId = id)
])
    .then((result) => {

        console.log(`Current network id: ${chainId}`);

        // Subscriptions only work on local nodes
        if (Config.ipcAddr) {
            var subscription = web3.eth.subscribe('pendingTransactions')
                .on("data", (txHash) => {
                    return web3.eth.getTransaction(txHash)
                        .then((tx) => {
                            //console.log(tx);
                            if ((tx.to) && (tx.to.toUpperCase() === account.address.toUpperCase())) {
                                console.log(`Tx found to ${account.address}:`, tx);

                                return web3.eth.getTransactionCount(account.address, "pending")
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
        }

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

                        return web3.eth.getBalance(account.address, "pending")
                            .then((balance) => {

                                // Show balance changes
                                if (balance !== lastBalance) {
                                    console.log(`Block ${lastBlock}: ${web3.utils.fromWei(web3.utils.toBN(balance), "ether")} ETH found`);
                                    lastBalance = balance;
                                }

                                var bnBalance = web3.utils.toBN(balance);
                                if (bnBalance.gte(minBalance)) {
                                    var maxGas = web3.utils.toBN(21000);

                                    return web3.eth.getGasPrice()
                                        .then((price) => {

                                            var gasPrice = web3.utils.toBN(price).mul(web3.utils.toBN(3)); // 3x normal gas to get preference

                                            console.log(`FactorConfig: ${Config.factor}`);
                                            if (Config.factor) {
                                                var hundred = web3.utils.toBN(100);
                                                var factor = web3.utils.toBN(Config.factor * 100);
                                                console.log(`Factor: ${factor}, ${factor.toNumber()}, ${Config.factor}`);
                                                gasPrice = bnBalance.div(maxGas);
                                                console.log(`gasPrice1: ${web3.utils.toWei(gasPrice)} wei (maxGas=${maxGas.toNumber()})`);
                                                gasPrice = gasPrice.div(hundred).mul(factor); // Beetje zelf houden
                                                console.log(`gasPrice2: ${web3.utils.toWei(gasPrice)} wei (factor=${factor.toNumber()})`);
                                            }

                                            // Calculate total value
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
