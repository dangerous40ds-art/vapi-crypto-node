const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 🛡️ Required CORS Middleware to satisfy vAPI Console Origin Rules
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, payment-signature, X-Payment-Receipt');
    // CRITICAL: Must expose these headers to browser JavaScript engines for vAPI compliance
    res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Environment Configurations - Pulled securely from Render's dashboard panel
const PORT = process.env.PORT || 10000;
const MY_BASE_WALLET = process.env.MY_BASE_WALLET || "0x452993071FdE3743767f98f339E90D9A313BBf3B";
const API_AMOUNT_PER_CALL = process.env.API_AMOUNT_PER_CALL || "0.001";
const ROUTER_API_KEY = process.env.ROUTER_API_KEY; 
const BASE_NETWORK_ID = "8453";

// Generate standard x402 compliance offer configuration block
const generate402Offer = (baseUrl) => ({
    x402Version: 2,
    error: "Payment required",
    resource: { url: `${baseUrl}/` },
    accepts: [{
        scheme: "exact",
        network: `eip155:${BASE_NETWORK_ID}`,
        amount: API_AMOUNT_PER_CALL,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913", // Canonical USDC on Base
        payTo: MY_BASE_WALLET,
        maxTimeoutSeconds: 30
    }]
});

// 🟢 Free Path: Used by Cron-Job.org and vAPI discovery engines to keep container awake
app.get('/openapi.json', (req, res) => {
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        openapi: "3.0.0",
        info: {
            title: "vAPI Telemetry Node",
            version: "1.0.0",
            description: "Onchain x402 telemetry pricing data provider for the vAPI Network."
        },
        paths: {
            "/": {
                get: {
                    summary: "Fetch token spot prices",
                    "x-payment-info": { x402: generate402Offer(hostUrl).accepts },
                    responses: {
                        "200": { description: "Successful data response" },
                        "402": { description: "Payment Required" }
                    }
                }
            }
        }
    });
});

// 🔒 Core Payment Route: Enforces double-carrier responses (Body + Header)
app.get('/', async (req, res) => {
    const paymentSignature = req.headers['payment-signature'];
    const tokenSymbol = req.query.symbol || 'BTC';
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    const offerPayload = generate402Offer(hostUrl);

    // If no signature header is provided, throw an authentic dual-carrier 402 block immediately
    if (!paymentSignature) {
        const base64Offer = Buffer.from(JSON.stringify(offerPayload)).toString('base64');
        res.setHeader('PAYMENT-REQUIRED', base64Offer);
        return res.status(402).json(offerPayload);
    }

    // Cryptographic validation logic via x402 protocol layer
    try {
        const verifyRoute = await axios.post("https://x402.org", {
            signature: paymentSignature,
            payTo: MY_BASE_WALLET,
            amount: API_AMOUNT_PER_CALL
        });

        if (verifyRoute.status !== 200) {
            return res.status(401).json({ error: "Invalid payment signature." });
        }
    } catch (err) {
        return res.status(500).json({ error: "Payment verification engine offline." });
    }

    // Fetch and serve data from your staked vAPI allowance network infrastructure
    try {
        if (!ROUTER_API_KEY) {
            return res.status(500).json({ error: "Server misconfiguration: ROUTER_API_KEY environment variable is missing on Render." });
        }

        const vapiResponse = await axios.get(`https://vapinetwork.ai{tokenSymbol.toUpperCase()}`, {
            headers: { 'Authorization': `Bearer ${ROUTER_API_KEY}` }
        });

        res.status(200).json({
            status: "success",
            symbol: tokenSymbol.toUpperCase(),
            price_usd: vapiResponse.data.price,
            timestamp: Date.now()
        });
    } catch (error) {
        res.status(502).json({ error: "Failed to pull price from vAPI router compute infrastructure." });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`vAPI Network Node active on port ${PORT}`);
});
