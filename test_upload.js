import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wfmayboaoufumpyejwph.supabase.co';
const supabaseKey = 'sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z';
const supabase = createClient(supabaseUrl, supabaseKey);

function parseIniFile(iniText) {
  const lines = iniText.split(/\r?\n/);
  const stocks = [];
  const isFixedWidth = lines.some(line => line.length >= 180 && !line.includes('='));

  if (isFixedWidth) {
    for (const line of lines) {
      if (line.length < 180) continue;
      const barcode = line.substring(0, 40).trim();
      const name = line.substring(80, 160).trim();
      const priceVal = line.substring(160, 180).trim().replace(',', '.');
      const price = parseFloat(priceVal) || 0;

      if (barcode) {
        stocks.push({ barcode, name, price });
      }
    }
  }

  const seenBarcodes = new Set();
  return stocks.filter(item => {
    if (!item.barcode) return false;
    if (seenBarcodes.has(item.barcode)) return false;
    seenBarcodes.add(item.barcode);
    return true;
  });
}

async function run() {
  try {
    console.log('Reading file...');
    const startRead = Date.now();
    const content = fs.readFileSync('C:\\Users\\User\\Desktop\\YAZARKASA_STOKLAR.ini', 'binary');
    console.log('File read done in', Date.now() - startRead, 'ms');

    console.log('Parsing file...');
    const startParse = Date.now();
    const parsedStocks = parseIniFile(content);
    console.log('Parsed stocks:', parsedStocks.length, 'in', Date.now() - startParse, 'ms');

    const branchId = 'meydan';
    
    // Add branch_id to each record
    const records = parsedStocks.map(item => ({
      branch_id: branchId,
      barcode: item.barcode,
      name: item.name,
      price: item.price,
      updated_at: new Date().toISOString()
    }));

    console.log('Deleting existing stocks for branch:', branchId);
    const startDel = Date.now();
    const { error: delErr } = await supabase
      .from('stocks')
      .delete()
      .eq('branch_id', branchId);
    console.log('Delete done in', Date.now() - startDel, 'ms', delErr ? 'Error: ' + delErr.message : 'Success');

    const chunkSize = 5000;
    const chunks = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      chunks.push(records.slice(i, i + chunkSize));
    }
    const totalChunks = chunks.length;

    console.log(`Uploading ${records.length} records in ${totalChunks} chunks of size ${chunkSize} with parallel concurrency 5...`);

    const startUpload = Date.now();
    
    let completedChunks = 0;
    const concurrencyLimit = 5;
    const queue = [...chunks.entries()]; // [index, chunk]

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [index, chunk] = item;
        
        const chunkStart = Date.now();
        const { error } = await supabase
          .from('stocks')
          .insert(chunk);

        if (error) {
          console.error(`Error uploading chunk ${index + 1}/${totalChunks}:`, error.message);
          throw error;
        }
        
        completedChunks++;
        const percent = Math.round((completedChunks / totalChunks) * 100);
        console.log(`Chunk ${index + 1}/${totalChunks} uploaded in ${Date.now() - chunkStart} ms - Progress: ${percent}%`);
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(concurrencyLimit, totalChunks); w++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    
    console.log('All parallel uploads completed in', Date.now() - startUpload, 'ms');

  } catch (e) {
    console.error('Run failed:', e);
  }
}

run();
