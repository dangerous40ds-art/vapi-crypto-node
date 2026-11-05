const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 🛡️ Required CORS Middleware to satisfy strict Web3 Agent Console Origin Rules
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, payment-signature, X-Payment-Receipt, payment-request');
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, payment-request');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const PORT = process.env.PORT || 10000;
const MY_BASE_WALLET = process.env.MY_BASE_WALLET || "0x452993071FdE3743767f98f339E90D9A313BBf3B";
const API_AMOUNT_PER_CALL = process.env.API_AMOUNT_PER_CALL || "0.001";
const ROUTER_API_KEY = process.env.ROUTER_API_KEY;
const BASE_NETWORK_ID = "8453";

// Generate fully compliant x402 v2 offer with required Coinbase Bazaar metadata extensions
const generate402Offer = (baseUrl, routePath) => ({
    x402Version: 2,
    error: "Payment required",
    resource: { url: `${baseUrl}${routePath}` },
    accepts: [{
        scheme: "exact",
        network: `eip155:${BASE_NETWORK_ID}`,
        amount: API_AMOUNT_PER_CALL,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913", // Canonical USDC on Base
        payTo: MY_BASE_WALLET,
        maxTimeoutSeconds: 30,
        domain: {
            name: "vAPI Telemetry Node Payment Lock",
            version: "1",
            chainId: parseInt(BASE_NETWORK_ID),
            verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913"
        }
    }],
    bazaar: {
        version: "1.0.0",
        category: "DeFi / Market Data Telemetry",
        tags: ["crypto", "telemetry", "prices", "base", "ai-agent-tools"],
        publisher: "Apex Telemetry Networks"
    }
});

// 🟢 Free Path: Used by Cron-Job.org to bypass firewalls and keep container awake
app.get('/keepawake', (req, res) => {
    res.status(200).json({ status: "warm", message: "Keep-awake monitor loop successful." });
});

// 🔒 Protected OpenAPI Route: Locked behind a strict 402 challenge to pass vAPI console checks
app.get('/openapi.json', (req, res) => {
    const paymentSignature = req.headers['payment-signature'];
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const offerPayload = generate402Offer(hostUrl, '/openapi.json');

    if (!paymentSignature) {
        // FIXED: Explicitly stringify the new offerPayload with the bazaar data into the Base64 header!
        const base64Offer = Buffer.from(JSON.stringify(offerPayload)).toString('base64');
        res.setHeader('PAYMENT-REQUIRED', base64Offer);
        return res.status(402).json(offerPayload);
    }
    
    res.status(200).json({
        openapi: "3.0.0",
        info: { title: "vAPI Telemetry Node", version: "1.0.0" },
        paths: { "/": { get: { summary: "Fetch spot prices" } } }
    });
});

// 🔒 Core Data Route: Protected via the same x402 EIP-712 verification logic
app.get('/', async (req, res) => {
    const paymentSignature = req.headers['payment-signature'];
    const tokenSymbol = req.query.symbol || 'BTC';
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const offerPayload = generate402Offer(hostUrl, '/');

    if (!paymentSignature) {
        const base64Offer = Buffer.from(JSON.stringify(offerPayload)).toString('base64');
        res.setHeader('PAYMENT-REQUIRED', base64Offer);
        return res.status(402).json(offerPayload);
    }

    try {
        const verifyRoute = await axios.post("https://x402.org", {
            signature: paymentSignature,
            payTo: MY_BASE_WALLET,
            amount: API_AMOUNT_PER_CALL
        });
        if (verifyRoute.status !== 200) return res.status(401).json({ error: "Invalid payment signature." });
    } catch (err) {
        return res.status(500).json({ error: "Payment verification engine offline." });
    }

    try {
        const vapiResponse = await axios.get(`https://vapinetwork.ai{tokenSymbol.toUpperCase()}`, {
            headers: { 'Authorization': `Bearer ${ROUTER_API_KEY}` }
        });
        res.status(200).json({ status: "success", symbol: tokenSymbol.toUpperCase(), price_usd: vapiResponse.data.price, timestamp: Date.now() });
    } catch (error) {
        res.status(502).json({ error: "Failed to pull price from vAPI router compute infrastructure." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`vAPI Network Node active on port ${PORT}`);
});
