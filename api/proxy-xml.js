export default async function handler(req, res) {
  // Extract URL from query
  // Vercel routes req.query automatically
  const xmlUrl = req.query.url;
  
  if (!xmlUrl) {
    return res.status(400).json({ error: 'URL parametresi gerekli.' });
  }

  try {
    console.log(`[VERCEL PROXY] XML talep ediliyor: ${xmlUrl}`);
    
    const response = await fetch(xmlUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`XML sunucusu hata döndürdü: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const contentType = response.headers.get('content-type') || '';
    let encoding = 'utf-8';
    
    if (contentType.toLowerCase().includes('windows-1254') || contentType.toLowerCase().includes('iso-8859-9')) {
      encoding = 'windows-1254';
    } else {
      const textSample = buffer.toString('ascii', 0, 500);
      if (textSample.toLowerCase().includes('windows-1254') || textSample.toLowerCase().includes('iso-8859-9') || textSample.toLowerCase().includes('ibm857')) {
        encoding = 'windows-1254';
      }
    }

    let decodedText;
    if (encoding === 'windows-1254') {
      const decoder = new TextDecoder('windows-1254');
      decodedText = decoder.decode(buffer);
      console.log(`[VERCEL PROXY] XML windows-1254 olarak decode edildi.`);
    } else {
      decodedText = buffer.toString('utf8');
      console.log(`[VERCEL PROXY] XML utf-8 olarak decode edildi.`);
    }

    // Set CORS and Content-Type headers
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    return res.status(200).send(decodedText);
  } catch (error) {
    console.error(`[VERCEL PROXY] HATA: ${error.message}`);
    return res.status(500).json({ error: `XML kaynağı çekilemedi: ${error.message}` });
  }
}
