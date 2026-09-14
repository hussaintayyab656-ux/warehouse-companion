const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
  'bookings',
  'grv_records',
  'grv_items',
  'purchase_orders',
  'purchase_orders_items',
  'suppliers',
  'bond_stock',
  'stock_counts',
  'delivery_advice',
  'events',
  'blocked_dates',
];

async function backup() {
  const workbook = new ExcelJS.Workbook();

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');

    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      continue;
    }

    const sheet = workbook.addWorksheet(table);

    if (data && data.length > 0) {
      sheet.columns = Object.keys(data[0]).map((key) => ({
        header: key,
        key: key,
        width: 20,
      }));
      sheet.addRows(data);
    }

    console.log(`✓ ${table}: ${data ? data.length : 0} rows`);
  }

  const today = new Date().toISOString().split('T')[0];
  const backupDir = path.join(__dirname, 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const filePath = path.join(backupDir, `backup-${today}.xlsx`);
  await workbook.xlsx.writeFile(filePath);

  console.log(`\nBackup saved: ${filePath}`);
}

backup().catch(console.error);