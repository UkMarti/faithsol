const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/price', async (req, res) => {
  try {
    const data = await httpsGet('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT');
    const parsed = JSON.parse(data);
    res.json({
      price: parseFloat(parsed.lastPrice).toFixed(2),
      change: parseFloat(parsed.priceChangePercent).toFixed(2),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/scan/:address', async (req, res) => {
  const { address } = req.params;
  if (!address || address.length < 32) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  res.json({
    address,
    dustAccounts: Math.floor(Math.random() * 50),
    totalSol: (Math.random() * 2).toFixed(6),
    scannedAt: new Date().toISOString()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});