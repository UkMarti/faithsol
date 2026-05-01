const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const HELIUS_API_KEY = "6d7bfc0c-2269-4595-ba5c-be854541d68c";
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  return res.json();
}

async function getSolPrice() {
  // Helius price API
  try {
    const res = await fetch(`https://api.helius.xyz/v1/price?apiKey=${HELIUS_API_KEY}`);
    if (res.ok) {
      const data = await res.json();
      if (data.price) return { price: data.price, source: 'helius' };
    }
  } catch (e) {}

  // Jupiter price API (working URL – NOT price.jup.ag)
  try {
    const jupRes = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112');
    const jupData = await jupRes.json();
    const price = jupData.data?.So11111111111111111111111111111111111111112?.price;
    if (price) return { price: parseFloat(price), source: 'jupiter' };
  } catch (e) {}

  throw new Error('Unable to fetch SOL price from any source');
}

app.get('/', (req, res) => {
  try {
    const html = fs.readFileSync('./index.html', 'utf8');
    res.send(html);
  } catch (e) {
    res.json({ service: 'FaithSol API', endpoints: ['/price', '/time', '/wallet/:address'] });
  }
});

app.get('/time', (req, res) => {
  res.json({ now: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) });
});

app.get('/price', async (req, res) => {
  try {
    const { price, source } = await getSolPrice();
    res.json({ sol: { usd: price }, source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/wallet/:address', async (req, res) => {
  const { address } = req.params;
  if (!address || address.length < 32) {
    return res.status(400).json({ error: 'Invalid Solana address' });
  }
  try {
    const balanceRes = await rpcCall('getBalance', [address]);
    const balance = balanceRes.result?.value / 1e9 || 0;
    res.json({ address, balanceSOL: balance, lamports: balanceRes.result?.value || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ FaithSol API running on port ${PORT}`);
});
