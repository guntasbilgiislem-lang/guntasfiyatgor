import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wfmayboaoufumpyejwph.supabase.co';
const supabaseKey = 'sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z';
const supabase = createClient(supabaseUrl, supabaseKey);

function parseIniFile(iniText) {
  const lines = iniText.split(/\r?\n/);
  const stocks = [];
  let currentStock = null;

  // Check if it is a standard [Section] based INI file or a key-value flat file
  const isSectionBased = lines.some(line => line.trim().startsWith('[') && line.trim().endsWith(']'));
  
  // Robust fixed-width check: check first 10 non-empty lines. If they are all >= 180 characters, it's fixed-width.
  const nonEmptyLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  const sampleLines = nonEmptyLines.slice(0, 10);
  const isFixedWidth = sampleLines.length > 0 && sampleLines.every(line => line.length >= 180);

  if (isSectionBased) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        if (currentStock && currentStock.barcode) {
          const price = currentStock.price4 !== undefined ? currentStock.price4 : (currentStock.priceDefault || 0);
          let discount_price = null;
          if (currentStock.discountRate > 0 && currentStock.discountRate < 100) {
            discount_price = Math.round((price - (price * currentStock.discountRate / 100)) * 100) / 100;
          }
          stocks.push({
            barcode: currentStock.barcode,
            name: currentStock.name,
            price,
            discount_price
          });
        }
        currentStock = { barcode: '', name: '', priceDefault: 0 };
      } else if (currentStock) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join('=').trim();

          if (key === 'barkod' || key === 'barcode' || key === 'ean') {
            currentStock.barcode = value;
          } else if (key === 'adi' || key === 'name' || key === 'urunadi' || key === 'adi1') {
            currentStock.name = value;
          } else if (key === 'fiyat4' || key === 'fiyat_4' || key === 'price4' || key === 'satis_fiyati4') {
            const cleanedPrice = value.replace(',', '.');
            currentStock.price4 = parseFloat(cleanedPrice) || 0;
          } else if (key === 'fiyat' || key === 'price' || key === 'satis_fiyat') {
            const cleanedPrice = value.replace(',', '.');
            currentStock.priceDefault = parseFloat(cleanedPrice) || 0;
          } else if (key === 'iskonto' || key === 'iskonto_orani' || key === 'discount_rate') {
            const cleanedDiscount = value.replace(',', '.');
            currentStock.discountRate = parseFloat(cleanedDiscount) || 0;
          }
        }
      }
    }
    if (currentStock && currentStock.barcode) {
      const price = currentStock.price4 !== undefined ? currentStock.price4 : (currentStock.priceDefault || 0);
      let discount_price = null;
      if (currentStock.discountRate > 0 && currentStock.discountRate < 100) {
        discount_price = Math.round((price - (price * currentStock.discountRate / 100)) * 100) / 100;
      }
      stocks.push({
        barcode: currentStock.barcode,
        name: currentStock.name,
        price,
        discount_price
      });
    }
  } else if (isFixedWidth) {
    // Fixed-width format:
    // Barcode: 0 to 40 (trimmed)
    // Name: 80 to 160 (trimmed)
    // Price 1: 160 to 180 (trimmed)
    // Price 4: 220 to 240 (trimmed) - Target Price 4
    // Discount Rate: 240 to 260 (trimmed) - Price 5 (Discount percentage)
    for (const line of lines) {
      if (line.length < 180) continue;
      const barcode = line.substring(0, 40).trim();
      const name = line.substring(80, 160).trim();
      
      const p1Val = line.substring(160, 180).trim().replace(',', '.');
      const p1 = parseFloat(p1Val) || 0;

      let price = p1;
      if (line.length >= 240) {
        const p4Val = line.substring(220, 240).trim().replace(',', '.');
        const p4 = parseFloat(p4Val) || 0;
        if (p4 > 0) {
          price = p4;
        }
      }

      let discount_price = null;
      if (line.length >= 260) {
        const p5Val = line.substring(240, 260).trim().replace(',', '.');
        const discountRate = parseFloat(p5Val) || 0;
        if (discountRate > 0 && discountRate < 100) {
          discount_price = Math.round((price - (price * discountRate / 100)) * 100) / 100;
        }
      }

      if (barcode) {
        stocks.push({ barcode, name, price, discount_price });
      }
    }
  } else {
    // flat key value file: e.g. 8690504000123=Urun Adi*15.50*18
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;

      const parts = trimmed.split('=');
      if (parts.length === 2) {
        const barcode = parts[0].trim();
        const details = parts[1].trim().split('*'); // common format for cash registers
        
        if (barcode && details.length >= 2) {
          const name = details[0].trim();
          
          // 4th price in order: details[4] (if exists), fallback to details[1] (1st price)
          let priceVal = details[1];
          if (details.length >= 5 && details[4] !== undefined && details[4].trim() !== '') {
            priceVal = details[4];
          }
          const price = parseFloat(priceVal.replace(',', '.')) || 0;

          let discount_price = null;
          // 5th in order (index 5) is the discount rate
          if (details.length >= 6 && details[5] !== undefined && details[5].trim() !== '') {
            const discountRateVal = details[5].replace(',', '.');
            const discountRate = parseFloat(discountRateVal) || 0;
            if (discountRate > 0 && discountRate < 100) {
              discount_price = Math.round((price - (price * discountRate / 100)) * 100) / 100;
            }
          }

          stocks.push({ barcode, name, price, discount_price });
        } else if (barcode && details.length === 1) {
          // just barcode and name
          stocks.push({ barcode, name: details[0].trim(), price: 0 });
        }
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
