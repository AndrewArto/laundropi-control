import express = require('express');

const router = express.Router();

const API_BASE = 'https://api.fact.pt';
const API_VERSION = '1.0.0';

function getApiKey(): string {
  const key = process.env.FACTPT_API_KEY;
  if (!key) throw new Error('FACTPT_API_KEY not configured');
  return key;
}

// Fixed invoice items (same every time = €99.94 total)
const INVOICE_ITEMS = [
  { id: 3305596, quantity: 5 },   // LAV9KG  €3.25 × 5  = €16.25
  { id: 3305599, quantity: 4 },   // LAV11KG €4.88 × 4  = €19.52
  { id: 3305602, quantity: 3 },   // LAV15KG €5.69 × 3  = €17.07
  { id: 3305605, quantity: 2 },   // LAV18KG €7.32 × 2  = €14.64
  { id: 3305608, quantity: 17 },  // SEC15KG €0.81 × 17 = €13.77
];
// Subtotal: €81.25 + 23% IVA = €99.94

const CLIENT_ID = 5409421; // Consumidor final

const PAYMENT_TYPES = [
  { value: 0,  label: 'Numerário (наличные)' },
  { value: 1,  label: 'Cartão de débito' },
  { value: 2,  label: 'Cartão de crédito' },
  { value: 3,  label: 'Cheque bancário' },
  { value: 4,  label: 'Cheque ou cartão oferta' },
  { value: 5,  label: 'Compensação de saldos' },
  { value: 6,  label: 'Dinheiro eletrónico' },
  { value: 7,  label: 'Letra comercial' },
  { value: 8,  label: 'Referência multibanco' },
  { value: 9,  label: 'Outros' },
  { value: 10, label: 'Permuta de bens' },
  { value: 11, label: 'Transferência bancária' },
  { value: 12, label: 'Ticket restaurante' },
];

// GET /api/invoicing/status — check API connection
router.get('/status', async (_req, res) => {
  try {
    const apiKey = getApiKey();
    const response = await fetch(`${API_BASE}/documents?page=1`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': apiKey,
        'api-version': API_VERSION,
      },
    });
    const result = await response.json() as any;
    res.json({
      connected: result.AppStatusCode === 200 || result.AppStatusCode === 202,
      totalDocuments: result.AppResponse?.totalItems ?? 0,
      paymentTypes: PAYMENT_TYPES,
    });
  } catch (err: any) {
    res.json({ connected: false, error: err.message, paymentTypes: PAYMENT_TYPES });
  }
});

// POST /api/invoicing/calculate
router.post('/calculate', (req, res) => {
  const { stripeRevenue, stripePercent } = req.body;

  if (!stripeRevenue || !stripePercent || stripePercent <= 0 || stripePercent >= 100) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const totalRevenue = stripeRevenue / (stripePercent / 100);
  const cashRevenue = totalRevenue - stripeRevenue;
  const invoiceAmount = 99.94;
  const numInvoices = Math.floor(cashRevenue / invoiceAmount);
  const remainder = cashRevenue - (numInvoices * invoiceAmount);

  res.json({
    totalRevenue: +totalRevenue.toFixed(2),
    cashRevenue: +cashRevenue.toFixed(2),
    invoiceAmount,
    numInvoices,
    remainder: +remainder.toFixed(2),
  });
});

// POST /api/invoicing/create — create one invoice
router.post('/create', async (req, res) => {
  try {
    const apiKey = getApiKey();
    const { date, paymentType } = req.body;
    const invoiceDate = date || new Date().toISOString().split('T')[0];

    const body = {
      client: { id: CLIENT_ID },
      document: {
        date: invoiceDate,
        paymentType: paymentType ?? 0,
        duePayment: invoiceDate,
        markPaid: true,
      },
      items: INVOICE_ITEMS,
    };

    const response = await fetch(`${API_BASE}/documents/invoicereceipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': apiKey,
        'api-version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json() as any;
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
