import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setupApp = async () => {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CENTRAL_DB_PATH = ':memory:';
  process.env.CENTRAL_ENV_FILE = '/dev/null';
  process.env.ALLOW_INSECURE = 'true';
  process.env.CORS_ORIGINS = 'http://localhost';
  process.env.REQUIRE_CORS_ORIGINS = 'false';
  process.env.AGENT_SECRETS = '';
  process.env.LAUNDRY_IDS = '';
  const mod = await import('../index');
  return mod.app as import('express').Express;
};

// Sample CSV content for CGD bank format
const createCsvContent = (transactions: Array<{ date: string; description: string; amount: string; reference?: string }>) => {
  const header = 'Data;Descrição;Montante;Referência';
  const rows = transactions.map(t => `${t.date};${t.description};${t.amount};${t.reference || ''}`);
  return [header, ...rows].join('\n');
};

describe('Expenditure API', { timeout: 30000 }, () => {
  describe('CSV Upload', () => {
    it('uploads a CSV file and creates import with transactions', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Detergente lavandaria', amount: '25,50' },
        { date: '16/01/2026', description: 'Reparação máquina', amount: '150,00' },
        { date: '17/01/2026', description: 'Electricidade', amount: '89,99' },
      ]);

      const response = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'test-import.csv')
        .send(csvContent)
        .expect(200);

      expect(response.body.import).toBeDefined();
      expect(response.body.import.fileName).toBe('test-import.csv');
      expect(response.body.import.totalTransactions).toBe(3);
      expect(response.body.import.status).toBe('uploaded');
      expect(response.body.transactions).toHaveLength(3);
      expect(response.body.transactions[0].reconciliationStatus).toBe('new');
    });

    it('rejects duplicate CSV files based on hash', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Test transaction', amount: '100,00' },
      ]);

      // First upload should succeed
      await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'duplicate-test.csv')
        .send(csvContent)
        .expect(200);

      // Second upload with same content should fail
      const response = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'duplicate-test-2.csv')
        .send(csvContent)
        .expect(409);

      expect(response.body.error).toBe('duplicate_file');
    });

    it('rejects CSV with invalid format', async () => {
      const app = await setupApp();

      const invalidCsv = 'Invalid,Header,Format\nno,valid,data';

      const response = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'invalid.csv')
        .send(invalidCsv)
        .expect(400);

      expect(response.body.error).toBe('parse_error');
    });

    it('parses European date formats correctly', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '05/02/2026', description: 'February transaction', amount: '50,00' },
      ]);

      const response = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'date-test.csv')
        .send(csvContent)
        .expect(200);

      // DD/MM/YYYY should be converted to YYYY-MM-DD
      expect(response.body.transactions[0].transactionDate).toBe('2026-02-05');
    });

    it('parses European number formats correctly', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Large amount', amount: '1234,56' },
      ]);

      const response = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'amount-test.csv')
        .send(csvContent)
        .expect(200);

      // 1234,56 (European decimal comma) should be parsed as 1234.56
      expect(response.body.transactions[0].amount).toBe(1234.56);
    });
  });

  describe('Import Management', () => {
    it('lists all imports', async () => {
      const app = await setupApp();

      // Create two imports
      const csv1 = createCsvContent([{ date: '15/01/2026', description: 'Transaction 1', amount: '100,00' }]);
      const csv2 = createCsvContent([{ date: '16/01/2026', description: 'Transaction 2', amount: '200,00' }]);

      await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'import1.csv')
        .send(csv1)
        .expect(200);

      await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'import2.csv')
        .send(csv2)
        .expect(200);

      const response = await request(app)
        .get('/api/expenditure/imports')
        .expect(200);

      expect(response.body.imports).toHaveLength(2);
    });

    it('gets import details with transactions and summary', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Transaction 1', amount: '100,00' },
        { date: '16/01/2026', description: 'Transaction 2', amount: '200,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'detail-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;

      const response = await request(app)
        .get(`/api/expenditure/imports/${importId}`)
        .expect(200);

      expect(response.body.import.id).toBe(importId);
      expect(response.body.transactions).toHaveLength(2);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.new).toBe(2);
    });

    it('deletes non-completed imports', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'To delete', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'delete-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;

      await request(app)
        .delete(`/api/expenditure/imports/${importId}`)
        .expect(200);

      await request(app)
        .get(`/api/expenditure/imports/${importId}`)
        .expect(404);
    });

    it('cannot delete completed imports', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Will be completed', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'complete-delete-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;
      const transactionId = uploadResponse.body.transactions[0].id;

      // Ignore the transaction so we can complete
      await request(app)
        .put(`/api/expenditure/transactions/${transactionId}`)
        .send({ reconciliationStatus: 'ignored' })
        .expect(200);

      // Complete the import
      await request(app)
        .put(`/api/expenditure/imports/${importId}`)
        .send({ status: 'completed' })
        .expect(200);

      // Try to delete - should fail
      await request(app)
        .delete(`/api/expenditure/imports/${importId}`)
        .expect(400);
    });
  });

  describe('Transaction Management', () => {
    it('updates transaction status to ignored', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'To ignore', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ignore-test.csv')
        .send(csvContent)
        .expect(200);

      const transactionId = uploadResponse.body.transactions[0].id;

      const response = await request(app)
        .put(`/api/expenditure/transactions/${transactionId}`)
        .send({
          reconciliationStatus: 'ignored',
          reconciliationNotes: 'Not laundry related',
        })
        .expect(200);

      expect(response.body.transaction.reconciliationStatus).toBe('ignored');
      expect(response.body.transaction.reconciliationNotes).toBe('Not laundry related');
    });

    it('assigns transaction to laundry and creates deduction', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Laundry expense', amount: '50,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'assign-test.csv')
        .send(csvContent)
        .expect(200);

      const transactionId = uploadResponse.body.transactions[0].id;
      const agentId = 'Laundry-1';

      const response = await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId })
        .expect(200);

      expect(response.body.transaction.reconciliationStatus).toBe('existing');
      expect(response.body.transaction.assignedAgentId).toBe(agentId);
      expect(response.body.revenueEntry).toBeDefined();
      expect(response.body.revenueEntry.deductions).toHaveLength(1);
      expect(response.body.revenueEntry.deductions[0].amount).toBe(50);
      expect(response.body.deductionKey).toBeDefined();
    });

    it('assigns transaction with custom date and comment', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Original description', amount: '75,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'custom-assign-test.csv')
        .send(csvContent)
        .expect(200);

      const transactionId = uploadResponse.body.transactions[0].id;
      const agentId = 'Laundry-1';
      const customDate = '2026-01-16';
      const customComment = 'Custom comment for deduction';

      const response = await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId, entryDate: customDate, comment: customComment })
        .expect(200);

      expect(response.body.revenueEntry.entryDate).toBe(customDate);
      expect(response.body.revenueEntry.deductions[0].comment).toBe(customComment);
    });

    it('rejects duplicate assignment of the same expense transaction', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Duplicate assignment expense', amount: '50,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'duplicate-assign-expense.csv')
        .send(csvContent)
        .expect(200);

      const transactionId = uploadResponse.body.transactions[0].id;
      const agentId = 'Laundry-1';

      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId })
        .expect(200);

      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId })
        .expect(409);

      const revenue = await request(app)
        .get('/api/revenue/Laundry-1')
        .query({ date: '2026-01-15' })
        .expect(200);

      expect(revenue.body.entry.deductions).toHaveLength(1);
      expect(revenue.body.entry.deductions[0].amount).toBe(50);
    });

    it('rejects duplicate assignment of the same stripe credit transaction', async () => {
      const app = await setupApp();

      const stripeCsv = [
        'Data;Descrição;Débito;Crédito;Referência',
        '15/01/2026;Stripe payout;;120,00;STRIPE-001',
      ].join('\n');

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'duplicate-assign-stripe.csv')
        .send(stripeCsv)
        .expect(200);

      const stripeTx = uploadResponse.body.transactions.find((t: any) => t.transactionType === 'stripe_credit');
      expect(stripeTx).toBeDefined();

      const transactionId = stripeTx.id;
      const agentId = 'Laundry-1';

      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign-stripe`)
        .send({ agentId, entryDate: '2026-01-15' })
        .expect(200);

      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign-stripe`)
        .send({ agentId, entryDate: '2026-01-15' })
        .expect(409);

      const revenue = await request(app)
        .get('/api/revenue/Laundry-1')
        .query({ date: '2026-01-15' })
        .expect(200);

      expect(revenue.body.entry.coinsTotal).toBe(120);
    });
  });

  describe('Auto-Ignore Previously Ignored Transactions', () => {
    it('auto-ignores transactions matching previously ignored ones', async () => {
      const app = await setupApp();

      // First import with a transaction we'll ignore
      const csv1 = createCsvContent([
        { date: '15/01/2026', description: 'Bank fee', amount: '5,00', reference: 'REF123' },
      ]);

      const upload1 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'first-import.csv')
        .send(csv1)
        .expect(200);

      const transactionId = upload1.body.transactions[0].id;

      // Mark as ignored
      await request(app)
        .put(`/api/expenditure/transactions/${transactionId}`)
        .send({ reconciliationStatus: 'ignored', reconciliationNotes: 'Bank fee - ignore' })
        .expect(200);

      // Second import with same transaction (same reference)
      const csv2 = createCsvContent([
        { date: '15/02/2026', description: 'Bank fee', amount: '5,00', reference: 'REF123' },
        { date: '15/02/2026', description: 'New expense', amount: '100,00', reference: 'REF456' },
      ]);

      const upload2 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'second-import.csv')
        .send(csv2)
        .expect(200);

      // The bank fee should be auto-ignored, the new expense should be new
      const autoIgnored = upload2.body.transactions.find((t: any) => t.bankReference === 'REF123');
      const newTx = upload2.body.transactions.find((t: any) => t.bankReference === 'REF456');

      expect(autoIgnored.reconciliationStatus).toBe('ignored');
      expect(autoIgnored.reconciliationNotes).toContain('Auto-ignored');
      expect(newTx.reconciliationStatus).toBe('new');
      expect(upload2.body.autoIgnoredCount).toBe(1);
    });

    it('auto-ignores by date+description+amount when no reference', async () => {
      const app = await setupApp();

      // First import
      const csv1 = createCsvContent([
        { date: '15/01/2026', description: 'Monthly bank charge', amount: '10,00' },
      ]);

      const upload1 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ignore-by-details-1.csv')
        .send(csv1)
        .expect(200);

      await request(app)
        .put(`/api/expenditure/transactions/${upload1.body.transactions[0].id}`)
        .send({ reconciliationStatus: 'ignored' })
        .expect(200);

      // Second import with same date+description+amount but in a different file (add another transaction to change hash)
      const csv2 = createCsvContent([
        { date: '15/01/2026', description: 'Monthly bank charge', amount: '10,00' },
        { date: '16/01/2026', description: 'Other transaction', amount: '50,00' },
      ]);

      const upload2 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ignore-by-details-2.csv')
        .send(csv2)
        .expect(200);

      // First transaction should be auto-ignored, second should be new
      const ignoredTx = upload2.body.transactions.find((t: any) => t.description === 'Monthly bank charge');
      const newTx = upload2.body.transactions.find((t: any) => t.description === 'Other transaction');

      expect(ignoredTx.reconciliationStatus).toBe('ignored');
      expect(newTx.reconciliationStatus).toBe('new');
    });
  });

  describe('Auto-Match Previously Assigned Transactions', () => {
    it('auto-marks transactions as existing when they match previously assigned ones by reference', async () => {
      const app = await setupApp();

      // First import: upload and assign a transaction
      const csv1 = createCsvContent([
        { date: '15/01/2026', description: 'Detergente', amount: '25,50', reference: 'REF-DET-001' },
      ]);

      const upload1 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'first-assigned.csv')
        .send(csv1)
        .expect(200);

      const txId = upload1.body.transactions[0].id;

      // Assign to a laundry
      await request(app)
        .post(`/api/expenditure/transactions/${txId}/assign`)
        .send({ agentId: 'Laundry-1' })
        .expect(200);

      // Second import: same transaction appears again (same reference, different file)
      const csv2 = createCsvContent([
        { date: '15/01/2026', description: 'Detergente', amount: '25,50', reference: 'REF-DET-001' },
        { date: '20/01/2026', description: 'New expense', amount: '100,00', reference: 'REF-NEW-001' },
      ]);

      const upload2 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'second-with-overlap.csv')
        .send(csv2)
        .expect(200);

      const matchedTx = upload2.body.transactions.find((t: any) => t.bankReference === 'REF-DET-001');
      const newTx = upload2.body.transactions.find((t: any) => t.bankReference === 'REF-NEW-001');

      expect(matchedTx.reconciliationStatus).toBe('existing');
      expect(matchedTx.assignedAgentId).toBe('Laundry-1');
      expect(matchedTx.reconciliationNotes).toContain('Auto-matched');
      expect(newTx.reconciliationStatus).toBe('new');
      expect(upload2.body.autoExistingCount).toBe(1);
    });

    it('auto-marks transactions as existing by date+description+amount when no reference', async () => {
      const app = await setupApp();

      // First import: upload and assign
      const csv1 = createCsvContent([
        { date: '10/01/2026', description: 'Electricity bill', amount: '89,99' },
      ]);

      const upload1 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'assigned-no-ref.csv')
        .send(csv1)
        .expect(200);

      await request(app)
        .post(`/api/expenditure/transactions/${upload1.body.transactions[0].id}/assign`)
        .send({ agentId: 'Laundry-2' })
        .expect(200);

      // Second import: same transaction by date+desc+amount
      const csv2 = createCsvContent([
        { date: '10/01/2026', description: 'Electricity bill', amount: '89,99' },
        { date: '11/01/2026', description: 'Water bill', amount: '45,00' },
      ]);

      const upload2 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'overlap-no-ref.csv')
        .send(csv2)
        .expect(200);

      const matchedTx = upload2.body.transactions.find((t: any) => t.description === 'Electricity bill');
      const newTx = upload2.body.transactions.find((t: any) => t.description === 'Water bill');

      expect(matchedTx.reconciliationStatus).toBe('existing');
      expect(matchedTx.assignedAgentId).toBe('Laundry-2');
      expect(newTx.reconciliationStatus).toBe('new');
    });

    it('prefers auto-ignore over auto-existing when both match', async () => {
      const app = await setupApp();

      // First import: upload, assign, then ignore
      const csv1 = createCsvContent([
        { date: '15/01/2026', description: 'Ambiguous fee', amount: '10,00', reference: 'REF-AMB' },
      ]);

      const upload1 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ambiguous-1.csv')
        .send(csv1)
        .expect(200);

      // Mark as ignored (this takes precedence)
      await request(app)
        .put(`/api/expenditure/transactions/${upload1.body.transactions[0].id}`)
        .send({ reconciliationStatus: 'ignored', reconciliationNotes: 'Not relevant' })
        .expect(200);

      // Second import with same transaction
      const csv2 = createCsvContent([
        { date: '15/01/2026', description: 'Ambiguous fee', amount: '10,00', reference: 'REF-AMB' },
        { date: '16/01/2026', description: 'Other tx', amount: '20,00' },
      ]);

      const upload2 = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ambiguous-2.csv')
        .send(csv2)
        .expect(200);

      const matchedTx = upload2.body.transactions.find((t: any) => t.bankReference === 'REF-AMB');
      // Auto-ignore check happens first, so it should be ignored, not existing
      expect(matchedTx.reconciliationStatus).toBe('ignored');
    });
  });

  describe('Import Completion', () => {
    it('completes import and sets completedAt timestamp', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Test', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'complete-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;
      const transactionId = uploadResponse.body.transactions[0].id;

      // Assign the transaction
      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId: 'Laundry-1' })
        .expect(200);

      // Complete the import
      const response = await request(app)
        .put(`/api/expenditure/imports/${importId}`)
        .send({ status: 'completed', notes: 'All reconciled' })
        .expect(200);

      expect(response.body.import.status).toBe('completed');
      expect(response.body.import.completedAt).toBeDefined();
      expect(response.body.import.notes).toBe('All reconciled');
    });

    it('cancels import', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'To cancel', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'cancel-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;

      const response = await request(app)
        .put(`/api/expenditure/imports/${importId}`)
        .send({ status: 'cancelled', notes: 'Wrong file' })
        .expect(200);

      expect(response.body.import.status).toBe('cancelled');
    });
  });

  describe('Deductions Endpoint', () => {
    it('lists deductions in date range', async () => {
      const app = await setupApp();

      // Create revenue entry with deductions
      await request(app)
        .put('/api/revenue/Laundry-1')
        .send({
          entryDate: '2026-01-15',
          coinsTotal: 100,
          euroCoinsCount: 50,
          billsTotal: 0,
          deductions: [
            { amount: 25, comment: 'Deduction 1' },
            { amount: 35, comment: 'Deduction 2' },
          ],
        })
        .expect(200);

      const response = await request(app)
        .get('/api/expenditure/deductions')
        .query({ startDate: '2026-01-01', endDate: '2026-01-31' })
        .expect(200);

      expect(response.body.deductions).toHaveLength(2);
      expect(response.body.deductions[0].key).toContain('Laundry-1:2026-01-15');
      expect(response.body.deductions[0].amount).toBe(25);
      expect(response.body.deductions[1].amount).toBe(35);
    });
  });

  describe('Audit Trail', () => {
    it('creates audit entries for import creation', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'Audited transaction', amount: '100,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'audit-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;

      const detailsResponse = await request(app)
        .get(`/api/expenditure/imports/${importId}`)
        .expect(200);

      const createAudit = detailsResponse.body.audit.find((a: any) => a.action === 'IMPORT_CREATED');
      expect(createAudit).toBeDefined();
      expect(createAudit.importId).toBe(importId);
    });

    it('creates audit entries for transaction assignment', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'For audit', amount: '50,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'assign-audit-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;
      const transactionId = uploadResponse.body.transactions[0].id;

      await request(app)
        .post(`/api/expenditure/transactions/${transactionId}/assign`)
        .send({ agentId: 'Laundry-1' })
        .expect(200);

      const detailsResponse = await request(app)
        .get(`/api/expenditure/imports/${importId}`)
        .expect(200);

      const assignAudit = detailsResponse.body.audit.find((a: any) => a.action === 'TRANSACTION_ASSIGNED');
      expect(assignAudit).toBeDefined();
      expect(assignAudit.transactionId).toBe(transactionId);
    });

    it('creates audit entries for transaction ignore', async () => {
      const app = await setupApp();

      const csvContent = createCsvContent([
        { date: '15/01/2026', description: 'To ignore for audit', amount: '50,00' },
      ]);

      const uploadResponse = await request(app)
        .post('/api/expenditure/imports')
        .set('Content-Type', 'text/csv')
        .set('X-Filename', 'ignore-audit-test.csv')
        .send(csvContent)
        .expect(200);

      const importId = uploadResponse.body.import.id;
      const transactionId = uploadResponse.body.transactions[0].id;

      await request(app)
        .put(`/api/expenditure/transactions/${transactionId}`)
        .send({ reconciliationStatus: 'ignored' })
        .expect(200);

      const detailsResponse = await request(app)
        .get(`/api/expenditure/imports/${importId}`)
        .expect(200);

      const ignoreAudit = detailsResponse.body.audit.find((a: any) => a.action === 'TRANSACTION_IGNORED');
      expect(ignoreAudit).toBeDefined();
    });
  });
});
