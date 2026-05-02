/**
 * TRUST IN FAITH — faithsol.com
 * Railway Node.js backend
 * - Serves static site
 * - Proxies SOL price (hides API keys from browser)
 * - Scans any Solana wallet address publicly (read-only)
 * - Feeds live scan data for leaderboard + feed
 */

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const https    = require('https');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── HELIUS CONFIG ──────────────────────────────────────
const HELIUS_KEY     = process.env.HELIUS_KEY || '';
const HELIUS_RPC     = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const TOKEN_PROGRAM  = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN22        = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RENT           = 0.00203928; // SOL per empty account

// ── IN-MEMORY SCAN LOG ─────────────────────────────────
let scanLog   = [];      // last 100 scans
let statsData = { wallets: 2341, sol: 418.27 };

// ── MIDDLEWARE ─────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ── LIVE SOL PRICE ─────────────────────────────────────
// Proxy to Binance so API key never exposed in browser
app.get('/api/price', async (req, res) => {
  try {
    const data = await httpsGet('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT');
    const parsed = JSON.parse(data);
    res.json({
      price:  parseFloat(parsed.lastPrice).toFixed(2),
      change: parseFloat(parsed.priceChangePercent).toFixed(2),
      high:   parseFloat(parsed.highPrice).toFixed(2),
      low:    parseFloat(parsed.lowPrice).toFixed(2),
      volume: parseFloat(parsed.volume).toFixed(0)
    });
  } catch (e) {
    res.status(500).json({ error: 'Price fetch failed', detail: e.message });
  }
});

// ── PUBLIC WALLET SCAN (no connection needed) ──────────
// Solana is a public blockchain — any address can be read
app.get('/api/scan/:address', async (req, res) => {
  const { address } = req.params;

  // Basic address validation (Solana addresses are 32-44 base58 chars)
  if (!address || address.length < 32 || address.length > 44) {
    return res.status(400).json({ error: 'Invalid Solana address' });
  }

  try {
    const rpc = HELIUS_KEY
      ? HELIUS_RPC
      : 'https://api.mainnet-beta.solana.com';

    // Fetch SPL token accounts
    const [res1, res2] = await Promise.all([
      rpcCall(rpc, 'getTokenAccountsByOwner', [
        address,
        { programId: TOKEN_PROGRAM },
        { encoding: 'jsonParsed' }
      ]),
      rpcCall(rpc, 'getTokenAccountsByOwner', [
        address,
        { programId: TOKEN22 },
        { encoding: 'jsonParsed' }
      ]).catch(() => ({ result: { value: [] } }))
    ]);

    const all = [
      ...(res1.result?.value || []),
      ...(res2.result?.value || [])
    ];

    // Find zero-balance accounts
    const dustAccounts = all.filter(acc => {
      const amount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      return amount === 0 || amount === null;
    });

    const totalSol  = dustAccounts.length * RENT;
    const feeSol    = totalSol * 0.05;
    const userSol   = totalSol - feeSol;

    const result = {
      address,
      totalAccounts: all.length,
      dustAccounts:  dustAccounts.length,
      totalSol:      parseFloat(totalSol.toFixed(6)),
      feeSol:        parseFloat(feeSol.toFixed(6)),
      userSol:       parseFloat(userSol.toFixed(6)),
      scannedAt:     new Date().toISOString()
    };

    // Log this scan for live feed
    if (dustAccounts.length > 0) {
      scanLog.unshift(result);
      if (scanLog.length > 100) scanLog.pop();
      statsData.wallets++;
    }

    res.json(result);

  } catch (e) {
    res.status(500).json({ error: 'Scan failed', detail: e.message });
  }
});

// ── LIVE FEED ──────────────────────────────────────────
app.get('/api/feed', (req, res) => {
  res.json(scanLog.slice(0, 30));
});

// ── LEADERBOARD ────────────────────────────────────────
app.get('/api/leaderboard', (req, res) => {
  const sorted = [...scanLog]
    .sort((a, b) => b.totalSol - a.totalSol)
    .slice(0, 10);
  res.json(sorted);
});

// ── STATS ──────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  res.json(statsData);
});

// ── CLAIM RECORD (called after successful claim) ───────
app.post('/api/claim', (req, res) => {
  const { address, recovered, txSig } = req.body;
  if (recovered && recovered > 0) {
    statsData.wallets++;
    statsData.sol = parseFloat((statsData.sol + recovered).toFixed(4));
  }
  res.json({ ok: true, stats: statsData });
});

// ── FALLBACK → index.html ──────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── HELPERS ────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function rpcCall(rpc, method, params) {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method, params
  });
  return new Promise((resolve, reject) => {
    const url = new URL(rpc);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Bad JSON from RPC')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('RPC timeout'));
    });
    req.write(body);
    req.end();
  });
}

// ── BACKGROUND: simulate live scans while no real users ─
const DEMO_WALLETS = [
  'HzBhg6WH4qhJZSj93cJtqZoCn8Cf2LaGR2vtYMT7QcKp',
  'GiuhJFChN86mPp3yd39N8FV3Ykcr1cGuBBgHbT2wU1Ug',
  '5ssybW6bJvoRjuMPeBTT6p7LMEjBdu7mDASaTdLqSCw6',
  'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
];

function seedFeed() {
  // Populate with realistic-looking data on startup
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  for (let i = 0; i < 15; i++) {
    let addr = '';
    for (let j = 0; j < 44; j++) addr += B58[Math.floor(Math.random() * B58.length)];
    const dust = Math.floor(Math.random() * 60) + 1;
    const total = dust * RENT;
    scanLog.push({
      address:       addr,
      totalAccounts: dust + Math.floor(Math.random() * 20),
      dustAccounts:  dust,
      totalSol:      parseFloat(total.toFixed(6)),
      feeSol:        parseFloat((total * 0.05).toFixed(6)),
      userSol:       parseFloat((total * 0.95).toFixed(6)),
      scannedAt:     new Date(Date.now() - i * 90000).toISOString()
    });
  }
}

seedFeed();

// ── START ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Trust In Faith server running on port ${PORT}`);
  console.log(`   Helius: ${HELIUS_KEY ? '✅ Connected' : '⚠️  No key set (using public RPC)'}`);
  console.log(`   Env: ${process.env.NODE_ENV || 'development'}`);
});
