import express from 'express';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;

// Hardcoded explicit configuration criteria for 0x4529...Bf3B
const MY_BASE_WALLET = "0x452993071FdE3743767f98f339E90D9A313BBf3B"; 
const API_AMOUNT_PER_CALL = "0.001"; 
const BASE_NETWORK_ID = "eip155:8453"; 
const ROUTER_API_KEY = "sk-nuTbTn3SZQqxgyWVohi8yw";

// 1. OpenAPI Specification Document Endpoint
app.get('/openapi.json', (req, res) => {
  res.json({
    openapi: "3.0.0",
    info: {
      title: "Live Crypto Price Node",
      version: "1.0.0",
      description: "Returns real-time token pricing via vAPI compute routing."
    },
    paths: {
      "/": {
        get: {
          summary: "Get live token price",
          "x-payment-info": {
            x402: {
              scheme: "exact",
              amount: API_AMOUNT_PER_CALL,
              asset: "USDC",
              network: BASE_NETWORK_ID,
              payTo: MY_BASE_WALLET,
              maxTimeoutSeconds: 30
            }
          },
          parameters: [
            {
              name: "symbol",
              in: "query",
              required: false,
              schema: { type: "string", default: "BTC" },
              description: "The crypto ticker symbol (e.g., BTC, ETH)"
                }
              ],
          responses: {
            "200": { description: "Successful price payload" },
            "402": { description: "Payment Required via x402 standard" }
          }
        }
      }
    }
  });
});

// 2. Main Payment Node Route Handler
app.get('/', async (req, res) => {
  const paymentSignature = req.headers['payment-signature'];

  // Throw authentic HTTP 402 challenge block if signature is missing
  if (!paymentSignature) {
    res.status(402)
       .set({
         'Content-Type': 'application/json',
         // FIXED: Removed the '$' symbol to pass strict numeric value checks
         'Payment-Required': `scheme=exact, amount=${API_AMOUNT_PER_CALL}, asset=USDC, network=${BASE_NETWORK_ID}, payTo=${MY_BASE_WALLET}, maxTimeoutSeconds=30`
       })
       .json({
         error: "Payment Required",
         message: "This endpoint requires an x402 programmatic stablecoin micro-payment.",
         accepts: [
           {
             scheme: "exact",
             network: BASE_NETWORK_ID,
             amount: API_AMOUNT_PER_CALL,
             asset: "USDC",
             payTo: MY_BASE_WALLET,
             maxTimeoutSeconds: 30,
             eip712: {
               domain: {
                 name: "USDC",
                 version: "1.0.0",
                 chainId: 8453,
                 verifyingContract: "0x0000000000000000000000000000000000000000"
               },
               types: {
                 Payment: [
                   { name: "payTo", type: "address" },
                   { name: "amount", type: "string" },
                   { name: "asset", type: "string" },
                   { name: "nonce", type: "uint256" }
                 ]
               }
             }
           }
         ],
         extensions: {
           bazaar: {
             version: "1.0.0",
             category: "financial-data",
             discoverable: true,
             method: "GET",
             queryParamsSchema: {
               type: "object",
               properties: {
                 symbol: { type: "string", default: "BTC" }
               }
             }
           }
         }
       });
    return;
  }

  // 3. Signature Validation Protocol (FIXED URL ROUTE PATH)
  try {
    const verifyRoute = await axios.post("https://x402.org", {
      signature: paymentSignature,
      payTo: MY_BASE_WALLET,
      amount: API_AMOUNT_PER_CALL
    });
    
    if (verifyRoute.status !== 200) {
      return res.status(401).json({ error: "Invalid payment signature verification payload." });
    }
  } catch (err) {
    return res.status(500).json({ error: "Payment verification framework timing timeout." });
  }

  // 4. Successful execution via your vAPI credits
  const tokenSymbol = req.query.symbol || 'BTC';

  try {
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

app.listen(PORT, () => console.log(`Production Active API Node routing on port ${PORT}`));
