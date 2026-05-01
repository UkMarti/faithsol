const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

// Simple price fetch from Binance – no API key, no complexity
async function getSolPrice() {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    const data = await res.json();
    return { price: parseFloat(data.price), source: 'binance' };
}

app.get('/price', async (req, res) => {
    try {
        const { price, source } = await getSolPrice();
        res.json({ sol: { usd: price }, source });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/time', (req, res) => {
    res.json({ now: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) });
});

app.get('/wallet/:address', async (req, res) => {
    const { address } = req.params;
    if (!address || address.length < 32) return res.status(400).json({ error: 'Invalid address' });
    try {
        const rpcRes = await fetch(`https://mainnet.helius-rpc.com/?api-key=6d7bfc0c-2269-4595-ba5c-be854541d68c`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] })
        });
        const rpcData = await rpcRes.json();
        const balance = rpcData.result?.value / 1e9 || 0;
        res.json({ address, balanceSOL: balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.json({ ok: true, endpoints: ['/price', '/time', '/wallet/:address'] });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ FaithSol API running on port ${PORT}`);
});
