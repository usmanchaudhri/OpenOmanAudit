import { mkdir, copyFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import Database from 'better-sqlite3';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'samples', 'al-noor-fy2025');
const uploadDir = path.join(root, 'storage', 'uploads');
const auditId = '32a7951a-a86e-4472-8feb-0d22e41d76ce';

const DISCLAIMER = 'TEST DATA FOR OPENOMAN AUDIT MANAGER — FICTITIOUS CLIENT — NOT FOR RELIANCE';

const invoices = [
  { number: 'INV-2025-014', date: '2025-01-15', customer: 'Nizwa Markets LLC', net: 86400, outstanding: 0, lines: [['Dried foodstuffs', 52000], ['Packaging supplies', 34400]] },
  { number: 'INV-2025-028', date: '2025-02-12', customer: 'Batinah Construction LLC', net: 124750, outstanding: 0, lines: [['Site consumables', 80250], ['Safety equipment', 44500]] },
  { number: 'INV-2025-041', date: '2025-03-03', customer: 'Qurum Hospitality LLC', net: 67200, outstanding: 0, lines: [['Housekeeping supplies', 41800], ['Kitchen consumables', 25400]] },
  { number: 'INV-2025-055', date: '2025-04-18', customer: 'Salalah Cold Store LLC', net: 142000, outstanding: 0, lines: [['Refrigerated goods', 142000]] },
  { number: 'INV-2025-063', date: '2025-05-09', customer: 'Nizwa Markets LLC', net: 91500, outstanding: 0, lines: [['Grocery wholesale', 91500]] },
  { number: 'INV-2025-078', date: '2025-06-22', customer: 'Batinah Construction LLC', net: 118300, outstanding: 0, lines: [['Building materials', 97300], ['Delivery', 21000]] },
  { number: 'INV-2025-084', date: '2025-07-14', customer: 'Qurum Hospitality LLC', net: 54800, outstanding: 0, lines: [['Linen and uniforms', 31200], ['Guest amenities', 23600]] },
  { number: 'INV-2025-096', date: '2025-08-02', customer: 'Salalah Cold Store LLC', net: 133450, outstanding: 0, lines: [['Frozen goods', 133450]] },
  { number: 'INV-2025-110', date: '2025-09-19', customer: 'Nizwa Markets LLC', net: 77600, outstanding: 0, lines: [['Wholesale groceries', 77600]] },
  { number: 'INV-2025-121', date: '2025-10-08', customer: 'Batinah Construction LLC', net: 156000, outstanding: 0, lines: [['Structural supplies', 121000], ['Tools', 35000]] },
  { number: 'INV-2025-134', date: '2025-11-11', customer: 'Qurum Hospitality LLC', net: 62250, outstanding: 12500, lines: [['Banquet supplies', 40750], ['Beverages', 21500]] },
  { number: 'INV-2025-148', date: '2025-12-16', customer: 'Salalah Cold Store LLC', net: 135750, outstanding: 135750, lines: [['Cold-chain goods', 135750]] },
];

const revenue = invoices.reduce((sum, invoice) => sum + invoice.net, 0);
const receivables = invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0);
if (revenue !== 1250000) throw new Error(`Revenue tie-out failed: ${revenue}`);
if (receivables !== 148250) throw new Error(`Receivables tie-out failed: ${receivables}`);

const profitAndLoss = [
  ['Revenue', 1250000],
  ['Trade discounts', -18500],
  ['Net revenue', 1231500],
  ['Cost of sales', -742800],
  ['Gross profit', 488700],
  ['Salaries and wages', -186400],
  ['Rent', -36000],
  ['Utilities', -8750],
  ['Depreciation', -22400],
  ['Other operating expenses', -14900],
  ['Operating profit', 220250],
  ['Finance cost', -6200],
  ['Profit before tax', 214050],
  ['Income tax expense', -32100],
  ['Profit for the year', 181950],
];

const assets = [
  ['Cash at bank', 96400],
  ['Trade receivables', 148250],
  ['Inventory', 210600],
  ['Prepayments', 8400],
  ['Property, plant and equipment', 233600],
];
const liabilities = [
  ['Trade payables', 92800],
  ['Accruals', 18400],
  ['Income tax payable', 32100],
  ['Bank loan', 80000],
];
const equity = [
  ['Share capital', 150000],
  ['Retained earnings brought forward', 142000],
  ['Profit for the year', 181950],
];

const totalAssets = assets.reduce((sum, row) => sum + row[1], 0);
const totalLiabilities = liabilities.reduce((sum, row) => sum + row[1], 0);
const totalEquity = equity.reduce((sum, row) => sum + row[1], 0);
if (totalAssets !== 697250 || totalLiabilities + totalEquity !== totalAssets) {
  throw new Error(`Balance sheet does not balance: assets ${totalAssets}, liabilities ${totalLiabilities}, equity ${totalEquity}`);
}
if (profitAndLoss.at(-1)[1] !== 181950) throw new Error('Profit figure drifted');

function sheet(rows, widths) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = widths.map((width) => ({ wch: width }));
  return worksheet;
}

function money(value) {
  return value;
}

const statements = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(statements, sheet([
  [DISCLAIMER],
  [],
  ['Al Noor Trading LLC'],
  ['Financial statements for the year ended 31 December 2025'],
  ['Currency: Omani Rial (OMR). Amounts are exclusive of VAT.'],
  ['Prepared as test evidence for an audit engagement. Figures are internally consistent.'],
  [],
  ['These statements agree to the customer billing register in the same sample folder.'],
  ['Trade receivables of 148,250 agree to unpaid invoices INV-2025-134 and INV-2025-148.'],
], [88]), 'Cover');

XLSX.utils.book_append_sheet(statements, sheet([
  [DISCLAIMER],
  ['Statement of profit or loss'],
  ['Year ended 31 December 2025', '', 'OMR'],
  [],
  ...profitAndLoss.map(([label, amount]) => [label, '', money(amount)]),
], [36, 4, 16]), 'Profit or loss');

XLSX.utils.book_append_sheet(statements, sheet([
  [DISCLAIMER],
  ['Statement of financial position'],
  ['As at 31 December 2025', '', 'OMR'],
  [],
  ['Assets'],
  ...assets.map(([label, amount]) => [label, '', money(amount)]),
  ['Total assets', '', totalAssets],
  [],
  ['Liabilities'],
  ...liabilities.map(([label, amount]) => [label, '', money(amount)]),
  ['Total liabilities', '', totalLiabilities],
  [],
  ['Equity'],
  ...equity.map(([label, amount]) => [label, '', money(amount)]),
  ['Total equity', '', totalEquity],
  ['Total liabilities and equity', '', totalLiabilities + totalEquity],
], [40, 4, 16]), 'Financial position');

const billing = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(billing, sheet([
  [DISCLAIMER],
  [],
  ['Al Noor Trading LLC — customer billing register'],
  ['Year ended 31 December 2025'],
  ['Invoice net amounts are exclusive of VAT and are the revenue population.'],
  [],
  ['Invoice', 'Date', 'Customer', 'Net OMR', 'Collected OMR', 'Outstanding OMR'],
  ...invoices.map((invoice) => [
    invoice.number,
    invoice.date,
    invoice.customer,
    invoice.net,
    invoice.net - invoice.outstanding,
    invoice.outstanding,
  ]),
  [],
  ['Total', '', '', revenue, revenue - receivables, receivables],
  [],
  ['Tie-out: total net billings agree to revenue on the statement of profit or loss.'],
  ['Tie-out: outstanding agrees to trade receivables on the statement of financial position.'],
], [18, 14, 32, 14, 16, 18]), 'Billing register');

function pdfInvoice(invoice) {
  const lines = [
    DISCLAIMER,
    '',
    'TAX INVOICE',
    'Al Noor Trading LLC',
    'Al Khuwair, Muscat, Sultanate of Oman',
    'Test CR 1234567',
    '',
    `Invoice ${invoice.number}`,
    `Date ${invoice.date}`,
    `Bill to ${invoice.customer}`,
    '',
    'Description                                      OMR',
    ...invoice.lines.map(([label, amount]) => `${label.padEnd(48, ' ')}${amount.toLocaleString('en-US')}`),
    '',
    `Net amount`.padEnd(48, ' ') + invoice.net.toLocaleString('en-US'),
    'VAT                                               excluded',
    `Amount due`.padEnd(48, ' ') + invoice.outstanding.toLocaleString('en-US'),
    '',
    'Payment terms: 30 days. This invoice is fictitious test data.',
  ];
  const commands = ['BT', '/F1 11 Tf', '50 760 Td', '14 TL'];
  for (const line of lines) {
    const safe = line.replace(/[()\\]/g, '');
    commands.push(`(${safe}) Tj`, 'T*');
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

await mkdir(outDir, { recursive: true });
await mkdir(uploadDir, { recursive: true });

const statementName = 'Al-Noor-FY2025-Financial-Statements.xlsx';
const billingName = 'Al-Noor-FY2025-Billing-Register.xlsx';
XLSX.writeFile(statements, path.join(outDir, statementName));
XLSX.writeFile(billing, path.join(outDir, billingName));

const pdfNames = [];
for (const invoice of [invoices[0], invoices[9], invoices[10], invoices[11]]) {
  const filename = `${invoice.number}.pdf`;
  const { writeFile } = await import('fs/promises');
  await writeFile(path.join(outDir, filename), pdfInvoice(invoice));
  pdfNames.push({ filename, label: `${invoice.number} ${invoice.customer}` });
}

const db = new Database(path.join(root, 'prisma', 'data', 'dev.db'));
const audit = db.prepare('select id from Audit where id = ?').get(auditId);
if (!audit) throw new Error('Sample audit Al Noor Trading LLC was not found');

const existing = db.prepare('select id, name from DocumentRequest where auditId = ?').all(auditId);
const insert = db.prepare(`
  insert into DocumentRequest (id, auditId, name, status, note, fileUrl, fileName, updatedBy, createdAt, updatedAt)
  values (?, ?, ?, 'Submitted', ?, ?, ?, 'sample-data', datetime('now'), datetime('now'))
`);
const update = db.prepare(`
  update DocumentRequest
  set status = 'Submitted', note = ?, fileUrl = ?, fileName = ?, updatedBy = 'sample-data', updatedAt = datetime('now')
  where id = ?
`);

async function publish(displayName, sourceName, note) {
  const diskName = `${randomUUID()}-${sourceName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  await copyFile(path.join(outDir, sourceName), path.join(uploadDir, diskName));
  const found = existing.find((row) => row.name === displayName);
  const fileUrl = `/uploads/${diskName}`;
  if (found) update.run(note, fileUrl, sourceName, found.id);
  else insert.run(randomUUID(), auditId, displayName, note, fileUrl, sourceName);
}

await publish(
  'Financial statements',
  statementName,
  'Fictitious FY2025 statements. Profit or loss and financial position balance, and revenue agrees to the billing register.',
);
await publish(
  'Customer billings',
  billingName,
  'Fictitious invoice register. Net billings OMR 1,250,000. Outstanding OMR 148,250 agrees to trade receivables.',
);
for (const pdf of pdfNames) {
  await publish(pdf.label, pdf.filename, 'Fictitious customer invoice from the FY2025 billing register.');
}

console.log(`Wrote sample documents to ${outDir}`);
console.log('Attached them to Al Noor Trading LLC');
