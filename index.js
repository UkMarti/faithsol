const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;
const HELIUS_API_KEY = "6d7bfc0c-2269-4595-ba5c-be854541d68c";

// Multiple price sources – if one fails, try the next
async function getSolPrice() {
    const errors = [];
    
    // Source 1: Jupiter (main)
    try {
        console.log("Trying Jupiter API...");
        const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
        if (res.ok) {
            const data = await res.json();
            const price = data.data?.So11111111111111111111111111111111111111112?.price;
            if (price) {
                console.log("✅ Price from Jupiter");
                return { price: parseFloat(price), source: 'jupiter' };
            }
        }
    } catch (e) { errors.push(`Jupiter: ${e.message}`); }

    // Source 2: Helius
    try {
        console.log("Trying Helius API...");
        const res = await fetch(`https://api.helius.xyz/v1/price?apiKey=${HELIUS_API_KEY}`);
        if (res.ok) {
            const data = await res.json();
            if (data.price) {
                console.log("✅ Price from Helius");
                return { price: data.price, source: 'helius' };
            }
        }
    } catch (e) { errors.push(`Helius: ${e.message}`); }

    // Source 3: Binance (no API key needed, very reliable)
    try {
        console.log("Trying Binance API...");
        const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
        if (res.ok) {
            const data = await res.json();
            if (data.price) {
                console.log("✅ Price from Binance");
                return { price: parseFloat(data.price), source: 'binance' };
            }
        }
    } catch (e) { errors.push(`Binance: ${e.message}`); }

    // Source 4: Coinbase (no API key needed)
    try {
        console.log("Trying Coinbase API...");
        const res = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot');
        if (res.ok) {
            const data = await res.json();
            const price = data.data?.amount;
            if (price) {
                console.log("✅ Price from Coinbase");
                return { price: parseFloat(price), source: 'coinbase' };
            }
        }
    } catch (e) { errors.push(`Coinbase: ${e.message}`); }

    console.error("All price sources failed:", errors);
    throw new Error(`Unable to fetch price. Errors: ${errors.join('; ')}`);
}

app.get('/price', async (req, res) => {
    try {
        const { price, source } = await getSolPrice();
        res.json({ sol: { usd: price }, source });
    } catch (err) {
        console.error("Price endpoint error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/time', (req, res) => {
    res.json({ now: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) });
});

app.get('/wallet/:address', async (req, res) => {
    const { address } = req.params;
    if (!address || address.length < 32) {
        return res.status(400).json({ error: 'Invalid Solana address' });
    }
    try {
        const rpcRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [address]
            })
        });
        const rpcData = await rpcRes.json();
        const balance = rpcData.result?.value / 1e9 || 0;
        res.json({ address, balanceSOL: balance, lamports: rpcData.result?.value || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'FaithSol API online', endpoints: ['/price', '/time', '/wallet/:address'] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ FaithSol API running on port ${PORT}`);
});
