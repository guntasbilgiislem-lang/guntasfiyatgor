import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve frontend static files from 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));

// CORS bypass proxy endpoint for XML feed
app.get('/api/proxy-xml', async (req, res) => {
  const xmlUrl = req.query.url;
  
  if (!xmlUrl) {
    return res.status(400).json({ error: 'URL parametresi gerekli.' });
  }

  try {
    console.log(`[PROXY] XML talep ediliyor: ${xmlUrl}`);
    
    const response = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`XML sunucusu hata döndürdü: ${response.status} ${response.statusText}`);
    }

    // Read feed as arrayBuffer first, then decode (in case it uses ISO-8859-9 encoding)
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Check Content-Type header or XML declaration for encoding
    const contentType = response.headers.get('content-type') || '';
    let encoding = 'utf-8';
    
    if (contentType.toLowerCase().includes('windows-1254') || contentType.toLowerCase().includes('iso-8859-9')) {
      encoding = 'windows-1254';
    } else {
      // Look into the buffer for encoding declaration (e.g. encoding="ISO-8859-9" or encoding="windows-1254")
      const textSample = buffer.toString('ascii', 0, 500);
      if (textSample.toLowerCase().includes('windows-1254') || textSample.toLowerCase().includes('iso-8859-9') || textSample.toLowerCase().includes('ibm857')) {
        encoding = 'windows-1254';
      }
    }

    let decodedText;
    if (encoding === 'windows-1254') {
      const decoder = new TextDecoder('windows-1254');
      decodedText = decoder.decode(buffer);
      console.log(`[PROXY] XML windows-1254 olarak decode edildi.`);
    } else {
      decodedText = buffer.toString('utf8');
      console.log(`[PROXY] XML utf-8 olarak decode edildi.`);
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(decodedText);
  } catch (error) {
    console.error(`[PROXY] HATA: ${error.message}`);
    res.status(500).json({ error: `XML kaynağı çekilemedi: ${error.message}` });
  }
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FiyatGör Sunucusu http://localhost:${PORT} portunda çalışıyor.`);
});
