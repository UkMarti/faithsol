const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;
const HELIUS_API_KEY = "6d7bfc0c-2269-4595-ba5c-be854541d68c";

// --- Helper function to fetch SOL price ---
async function getSolPrice() {
    // 1. Try to get price from your Helius API
    try {
        console.log("Attempting to fetch price from Helius...");
        const res = await fetch(`https://api.helius.xyz/v1/price?apiKey=${HELIUS_API_KEY}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.price) {
                console.log("Successfully fetched price from Helius.");
                return { price: data.price, source: 'helius' };
            }
        }
    } catch (error) {
        console.error("Helius error: could not connect to get price.", error.message);
    }

    // 2. Fallback to the new Jupiter API
    try {
        console.log("Helius failed, attempting to fetch price from Jupiter...");
        const jupRes = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
        if (jupRes.ok) {
            const jupData = await jupRes.json();
            const price = jupData.data?.So11111111111111111111111111111111111111112?.price;
            if (price) {
                console.log("Successfully fetched price from Jupiter.");
                return { price: parseFloat(price), source: 'jupiter' };
            }
        }
    } catch (error) {
        console.error("Jupiter error: could not connect to get price.", error.message);
    }

    // 3. Final fallback: return a placeholder price so the site doesn't crash
    console.log("All price APIs failed. Using a placeholder price.");
    return { price: 130.00, source: 'fallback' };
}

// --- Your API Endpoints ---
app.get('/time', (req, res) => {
    res.json({ now: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) });
});

app.get('/price', async (req, res) => {
    try {
        const { price, source } = await getSolPrice();
        res.json({ sol: { usd: price }, source });
    } catch (err) {
        console.error("Price endpoint error:", err.message);
        res.status(500).json({ error: "Unable to fetch SOL price. Please try again later." });
    }
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
        console.error("Wallet endpoint error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'FaithSol API is online!', endpoints: ['/price', '/time', '/wallet/:address'] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ FaithSol API running on port ${PORT}`);
});
