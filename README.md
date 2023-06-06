# batchMinter

## node version
Tested node version 16.15

## installation
```
yarn
```

## environment variables setup
Required env variables can be found in the .env.example file

## batch fund account from main address
wallets: number of wallets to use \
fund: the amount of native tokens per wallet \
```
node ./src/batchMinter.js --stage=fund --wallets=10 --fund=0.02
```

## batch mint ERC20 tokens
mintAmount: the amount of ERC20 tokens to mint
```
node ./src/batchMinter.js --stage=mint --wallets=10 --mintAmount=10
```

## batch transfer the minted ERC20 tokens back to main address
```
node ./src/batchMinter.js --stage=transfer --wallets=10
```

## batch refund the remaining native tokens back to main address
```
node ./src/batchMinter.js --stage=refund --wallets=10
```

## optional paramter
The amount of gwei for gas price
```
--gasPrice=0.3
```