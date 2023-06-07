
import contract_artifacts from './ERC20.json' assert { type: "json" };
import { ethers, Wallet, BigNumber } from 'ethers';
import dotenv from 'dotenv';
import stdio from 'stdio';
dotenv.config();

const fundMnemonic = process.env.FUND_MNEMONIC;
const mnemonic = process.env.MNEMONIC;
const zksync_rpc_api = process.env.ZKSYNC_RPC_API;
const contractAddress = process.env.CONTRACT_ADDRESS;

let path = `m/44'/60'/0'/0/`;
const provider = new ethers.providers.JsonRpcProvider(zksync_rpc_api);


let masterWalletNumber = 20;
// initialise master wallets
const masterWalletList = [];
for (let i = 0; i < masterWalletNumber; i++) {
    let wallet = Wallet.fromMnemonic(fundMnemonic, path + (i+1).toString()).connect(provider);
    console.log(await wallet.getAddress());
    // check balance
    let balance = await wallet.getBalance();
    console.log(balance.toString());
    masterWalletList.push(wallet);
}

let ops = stdio.getopt({
    'mintAmount': {key: 'm', default: 10, args: 1, description: 'The number of wallets to fill'},
    'wallets': {key: 'w', default: 10, args: 1, description: 'The number of wallets to fill'},
    'fund': {key: 'f', default: "0.002", args: 1, description: 'The amount of ether to fund each of the wallet with'},
    'stage': {key:"s", args: 1, default: "init", required: true, description: 'The stage of the script to run. init, mint, or refund'},
    'gasPrice': {key:"g", args: 1, default: "0.3", description: 'The gas price to use for transactions'}
});

console.log(ops);
const {wallets, fund, stage, mintAmount, gasPrice} = ops;

if (!['fund', 'mint', 'transfer', 'refund']) {
    console.log("Invalid stage. Please choose either init or mint");
    process.exit(1);
}

let walletNumber = parseInt(wallets);
let walletList = [];

// INITIALISE WALLETS
// =================================================================================================
if (stage === "fund") {
    // distribute token to different addresses
    const initialise_wallets = async (mnemonic, wallet_num, from_wallet_number) => {
        let from_wallet = masterWalletList[from_wallet_number];
        
        let walletList = [];
        for ( let i = 0 ; i < wallet_num ; i ++ ) {
            // get wallet and connect to provider
            let wallet = Wallet.fromMnemonic(mnemonic, path + (from_wallet_number * wallet_num + i + 1).toString()).connect(provider);
            // disperse matic if not sufficient
            let balance = await wallet.getBalance();
            if (balance.lt(ethers.utils.parseEther(fund))) {
                console.log("Transferring ether to address" + (from_wallet_number * wallet_num + i+1).toString());
                const tx = await from_wallet.sendTransaction({
                    to: await wallet.getAddress(),
                    value: ethers.utils.parseEther(fund).sub(balance),
                }, {gasPrice: ethers.utils.parseUnits(gasPrice, "gwei")});
                await tx.wait();
            }
            console.log("Funded", i, "wallet", await wallet.getAddress(), (await wallet.getBalance()).toString());
            walletList.push(wallet);
        }
        return walletList;
    }

    // initialise wallets, please do it before the real minting event to save time
    for (let i = 0; i < masterWalletNumber; i++) {
        walletList = await initialise_wallets(mnemonic, walletNumber, i);
    }
}

// // BATCH MINTING
// // =================================================================================================
if (stage === "mint") {
    const contract = new ethers.Contract(
        contractAddress,
        contract_artifacts.abi,
        new ethers.providers.JsonRpcProvider(zksync_rpc_api)
    );

    // fetch wallets
    let walletList = [];
    for (let i = 0; i < masterWalletNumber*walletNumber; i++) {
        let wallet = Wallet.fromMnemonic(mnemonic, path + (i+1).toString()).connect(provider);
        walletList.push(wallet);
    }

    // batch mint
    let success = 0;
    await Promise.all(walletList.map(async (wallet) => {
        try {
            const tx = await contract.connect(wallet).batchMint(
                await wallet.getAddress(),
                mintAmount,
                {
                    gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei')
                }
            )
            await tx. wait();
            success = success + 1;
        } catch (e) {
            console.log(e);
        }
    }));

    console.log("Success: " + success.toString() + "/" + walletNumber.toString());
}

if (stage === "transfer") {
    const contract = new ethers.Contract(
        contractAddress,
        contract_artifacts.abi,
        new ethers.providers.JsonRpcProvider(zksync_rpc_api)
    );

    // distribute token to different addresses
    const transferTokens = async (from_wallet, to_wallet) => {
        let fromAddress  = await from_wallet.getAddress();
        let toAddress = await to_wallet.getAddress();
        let balance = await contract.balanceOf(fromAddress);
        if (balance.gt(0)) {
            const tx = await contract.connect(from_wallet).transfer(
                toAddress,
                balance,
                {
                    gasPrice: ethers.utils.parseUnits(gasPrice, 'gwei')
                }
            )
            await tx.wait();
            return balance;
        }
        return BigNumber.from(0);
    }

    const transfer_tokens_from_all_wallets = async (mnemonic, wallet_num, targetWallet) => {
        let walletList = [];
        for ( let i = 0 ; i < wallet_num ; i ++ ) {
            // get wallet and connect to provider
            let wallet = Wallet.fromMnemonic(mnemonic, path + (i+1).toString()).connect(provider);
            walletList.push(wallet);
        }
        let totalTransfered = BigNumber.from(0);
        await Promise.all(walletList.map(async (wallet) => {
            try {
                const transferedAmount = await transferTokens(wallet, targetWallet);
                totalTransfered = totalTransfered.add(transferedAmount);
            } catch (e) {
                console.log(e);
            }
        }));
        console.log("Total refunded: ", totalTransfered.toString());
    }

    // initialise wallets, please do it before the real minting event to save time
    await transfer_tokens_from_all_wallets(mnemonic, walletNumber, tokenVaultSigner);
    console.log(`Total wallets refunded: ${walletList.length}`);
}

if (stage === "refund") {
    // distribute token to different addresses
    const refund_wallets = async (from_wallet, to_wallet) => {
        let balance = await from_wallet.getBalance();

        // leave 0.0001 for gas
        if (balance.gt(ethers.utils.parseEther("0.001", "gwei"))) {
            const tx = await from_wallet.sendTransaction({
                to: await to_wallet.getAddress(),
                value: balance.sub(ethers.utils.parseEther("0.001", "gwei")),
            }, {
                gasLimit: 21000,
                gasPrice: ethers.utils.parseUnits(gasPrice, "gwei")
            });
            await tx.wait();
            return balance.sub(ethers.utils.parseEther("0.001", "gwei"));
        }
        return BigNumber.from(0);
    }

    const refund_all_wallets = async (mnemonic, wallet_num, targetWallet) => {
        let walletList = [];
        for ( let i = 0 ; i < wallet_num ; i ++ ) {
            // get wallet and connect to provider
            let wallet = Wallet.fromMnemonic(mnemonic, path + (i+1).toString()).connect(provider);
            walletList.push(wallet);
        }
        let totalRefunded = BigNumber.from(0);
        await Promise.all(walletList.map(async (wallet) => {
            try {
                const refundedAmount = await refund_wallets(wallet, targetWallet);
                totalRefunded = totalRefunded.add(refundedAmount);
            } catch (e) {
                console.log(e);
            }
        }));
        console.log("Total refunded: ", totalRefunded.toString());
    }

    // initialise wallets, please do it before the real minting event to save time
    await refund_all_wallets(mnemonic, walletNumber, tokenVaultSigner);
}