const Q = require('q');
const Web3 = require('web3');
const Request = require('request');
const BigNumber = require('bignumber.js');
const ERC20Contract = require('erc20-contract-js');

const Config = require('./config');

if (typeof web3 !== 'undefined') {
  web3 = new Web3(web3.currentProvider);
} else {
  web3 = new Web3(new Web3.providers.HttpProvider(Config.rpcAddr));
}

const BN = web3.utils.BN;

var account = web3.eth.accounts.privateKeyToAccount(Config.sourcePrivKey);
console.log('Opened account:', account.address);

var tokenList = [];
Q.all([Request.get(Config.tokenListUrl, { json: true }, (err, response, body) => {
  if (err) {
    console.error('Failed to load tokenListUrl:', err);
  }
  if (body) {
    tokenList = body;
    console.log(`Loaded ${tokenList.length} tokens`)
  }
}),
web3.eth.getBalance(account.address)
  .then(balance => console.log(`Source address (${account.address}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`)),
web3.eth.getBalance(Config.targetAddress)
  .then(balance => console.log(`Target address (${Config.targetAddress}) balance: ${web3.utils.fromWei(new BN(balance), "ether")} ETH`))
])
  .then((result) => {
    var promises = [];
    console.log('Checking ERC20 token balances...');
    tokenList.forEach((t) => {
      promises.push(new ERC20Contract(web3, t.address).balanceOf(account.address).call()
        .then(balance => {
          if (balance !== "0") {
            console.log(`${t.symbol}: ${web3.utils.fromWei(new BN(balance), "ether")}`);
          }
        })
        .catch(err => console.log(err)));
    });

    Q.all(promises).then((res) => {
      console.log('Done');
    })
  });
