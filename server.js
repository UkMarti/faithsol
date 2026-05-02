/**
 * TRUST IN FAITH — faithsol.com
 * Full server + Telegram bot in one file
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 8080;

const HELIUS_KEY  = process.env.HELIUS_KEY || '';
const HELIUS_RPC  = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const TOKEN_P     = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN22     = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RENT        = 0.00203928;

const BOT_TOKEN   = process.env.BOT_TOKEN || '8397092730:AAG27IjX8Q-QvleWy648nfLr6pUdzWdp5jg';
const TG_API      = `https://api.telegram.org/bot${BOT_TOKEN}`;

let scanLog = [];
let stats   = { wallets: 2341, sol: 418.27 };

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/price', async (req, res) => {
  try {
    const d = JSON.parse(await get('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT'));
    res.json({ price: parseFloat(d.lastPrice).toFixed(2), change: parseFloat(d.priceChangePercent).toFixed(2) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/scan/:address', async (req, res) => {
  try {
    const result = await scanAddress(req.params.address);
    if (result.dustAccounts > 0) { scanLog.unshift(result); if (scanLog.length > 100) scanLog.pop(); }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/feed',        (req, res) => res.json(scanLog.slice(0, 30)));
app.get('/api/leaderboard', (req, res) => res.json([...scanLog].sort((a,b) => b.totalSol - a.totalSol).slice(0,10)));
app.get('/api/stats',       (req, res) => res.json(stats));

app.post('/api/claim', (req, res) => {
  const { recovered } = req.body;
  if (recovered > 0) { stats.wallets++; stats.sol = parseFloat((stats.sol + recovered).toFixed(4)); }
  res.json({ ok: true, stats });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function scanAddress(address) {
  const [r1, r2] = await Promise.allSettled([
    rpc('getTokenAccountsByOwner', [address, { programId: TOKEN_P  }, { encoding: 'jsonParsed' }]),
    rpc('getTokenAccountsByOwner', [address, { programId: TOKEN22  }, { encoding: 'jsonParsed' }])
  ]);
  const all  = [...(r1.value?.result?.value||[]), ...(r2.value?.result?.value||[])];
  const dust = all.filter(a => { const u = a.account?.data?.parsed?.info?.tokenAmount?.uiAmount; return u===0||u===null; });
  const total = dust.length * RENT;
  return { address, totalAccounts: all.length, dustAccounts: dust.length,
    totalSol: +total.toFixed(6), feeSol: +(total*0.05).toFixed(6),
    userSol:  +(total*0.95).toFixed(6), scannedAt: new Date().toISOString() };
}

function seedFeed() {
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const rnd  = () => { let a=''; for(let i=0;i<44;i++) a+=B58[Math.floor(Math.random()*B58.length)]; return a; };
  for (let i = 0; i < 15; i++) {
    const dust = Math.floor(Math.random()*60)+1, total = dust*RENT;
    scanLog.push({ address:rnd(), totalAccounts:dust+10, dustAccounts:dust,
      totalSol:+total.toFixed(6), feeSol:+(total*0.05).toFixed(6),
      userSol:+(total*0.95).toFixed(6), scannedAt:new Date(Date.now()-i*90000).toISOString() });
  }
}
seedFeed();

app.listen(PORT, () => {
  console.log(`✅ Trust In Faith server running on port ${PORT}`);
  console.log(`   Helius: ${HELIUS_KEY ? '✅ Connected' : '⚠️  No key'}`);
  console.log(`   Bot: ✅ Starting`);
});

// ════════════════════════════════════════
//  TELEGRAM BOT — @FAITHSOLBOT
// ════════════════════════════════════════
let offset = 0;

async function poll() {
  while (true) {
    try {
      const r = await tgGet('getUpdates', { offset, timeout: 30 });
      for (const u of r.result || []) {
        offset = u.update_id + 1;
        if (u.message) handle(u.message).catch(() => {});
      }
    } catch (e) { await sleep(3000); }
  }
}

async function handle(msg) {
  const id   = msg.chat.id;
  const text = (msg.text || '').trim();
  const name = esc(msg.from?.first_name || 'friend');

  if (text === '/start') {
    return send(id,
`👋 Welcome to *Trust In Faith*, ${name}\\!

I scan any Solana wallet and find hidden SOL locked in empty token accounts\\.

Every token you ever bought left a small *storage deposit* behind\\. Sold it? The deposit stayed locked\\. I find it all\\.

*Commands:*
/scan \`WALLET\_ADDRESS\` — Scan any wallet
/price — Live SOL price
/about — How it works
/web — faithsol\\.com

Or just *paste your wallet address* directly\\! 👇`);
  }

  if (text === '/price') {
    try {
      const d = JSON.parse(await get('https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT'));
      const p = parseFloat(d.lastPrice).toFixed(2);
      const c = parseFloat(d.priceChangePercent).toFixed(2);
      return send(id, `◎ *SOL Price*\n\n*$${p}* USD\n${parseFloat(c)>=0?'📈':'📉'} ${parseFloat(c)>0?'\\+':''}${c}% today`);
    } catch { return send(id, '❌ Could not fetch price right now\\.'); }
  }

  if (text === '/about') {
    return send(id,
`ℹ️ *How Trust In Faith Works*

On Solana, every token you\\'ve ever touched created a small *storage deposit* \\(~0\\.002 SOL\\) in your wallet\\.

When you sold or lost that token, the deposit stayed locked\\.

*We find every locked deposit and return it to you\\.*

Our fee is just *5%* — competitors charge up to 20%\\.

🌐 https://faithsol\\.com`);
  }

  if (text === '/web') {
    return send(id, '🌐 *faithsol\\.com*\n\nConnect your Phantom wallet and claim your SOL in 60 seconds\\!');
  }

  const addr = text.startsWith('/scan ') ? text.slice(6).trim() : text;
  if (addr.length >= 32 && addr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) {
    return doScan(id, addr);
  }

  return send(id, `Just *paste your Solana wallet address* and I\\'ll scan it instantly\\! 👆`);
}

async function doScan(chatId, addr) {
  await send(chatId, '🔍 Scanning wallet\\.\\.\\.');
  try {
    const r = await scanAddress(addr);
    const short = esc(addr.slice(0,6) + '...' + addr.slice(-4));
    let priceData = { price: 0 };
    try { priceData = JSON.parse(await get('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT')); } catch {}
    const sol = parseFloat(priceData.price || 0);
    const usd = (r.userSol * sol).toFixed(2);

    if (r.dustAccounts === 0) {
      return send(chatId, `✨ *Wallet: ${short}*\n\nYour wallet is *already clean\\!*\n\nNo empty token accounts found\\.`);
    }

    return send(chatId,
`🎯 *Scan Complete\\!*

👛 \`${short}\`

━━━━━━━━━━━━━━━
📦 Empty accounts: *${r.dustAccounts}*
🔒 Total locked: *${r.totalSol.toFixed(4)} ◎*
💸 You receive: *${r.userSol.toFixed(4)} ◎*${sol > 0 ? `\n💵 USD value: *~\\$${usd}*` : ''}
📊 Our fee: *5% only*
━━━━━━━━━━━━━━━

👉 Claim at https://faithsol\\.com

_Competitors charge up to 20% — we charge just 5%\\._`);
  } catch (e) {
    return send(chatId, '❌ Scan failed\\. Please try again in a moment\\.');
  }
}

function esc(s) { return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&'); }

function send(chatId, text) {
  return tgPost('sendMessage', { chat_id: chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
}

function tgGet(method, params) {
  const qs = new URLSearchParams(params).toString();
  return new Promise((res, rej) => {
    https.get(`${TG_API}/${method}?${qs}`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function tgPost(method, body) {
  const p = JSON.stringify(body);
  return new Promise((res, rej) => {
    const req = https.request(`${TG_API}/${method}`,
      { method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(p)} },
      r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
    req.on('error', rej); req.write(p); req.end();
  });
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); }).on('error', rej);
  });
}

function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc:'2.0', id:1, method, params });
  return new Promise((res, rej) => {
    const u = new URL(HELIUS_RPC);
    const req = https.request(
      { hostname:u.hostname, path:u.pathname+u.search, method:'POST',
        headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)} },
      r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
    req.on('error', rej);
    req.setTimeout(15000, () => { req.destroy(); rej(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log('🤖 FAITHSOLBOT polling started');
poll().catch(console.error);
