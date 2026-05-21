import { supabase } from './supabase.js';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('auth_token') || null;
    this.currentUser = JSON.parse(localStorage.getItem('current_user')) || null;
    
    // In-memory cache for the parsed XML products
    this.xmlProductsMap = new Map();
    this.xmlLoaded = false;
    this.xmlLoading = false;
  }

  setToken(token, user) {
    this.token = token;
    this.currentUser = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('current_user', JSON.stringify(user));
  }

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
  }

  // --- LOGIN ---
  async login(username, password) {
    username = username ? username.trim() : '';
    password = password ? password.trim() : '';

    if (!username || !password) {
      throw new Error('Kullanıcı adı ve şifre boş bırakılamaz.');
    }

    // Admin login
    if (username === 'admin') {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', 'admin')
        .eq('password', password)
        .maybeSingle();

      if (error) throw new Error('Veritabanı hatası: ' + error.message);
      if (!data) throw new Error('Hatalı admin şifresi.');

      const user = { id: 'admin', name: data.name, role: 'admin' };
      this.setToken('jwt_admin_' + Date.now(), user);
      return user;
    }

    // Branch login
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', username)
      .eq('password', password)
      .maybeSingle();

    if (error) throw new Error('Veritabanı hatası: ' + error.message);
    if (!data) throw new Error('Hatalı kullanıcı adı veya şifre.');

    const user = { id: data.id, name: data.name, role: 'branch', password: data.password };
    this.setToken('jwt_branch_' + username + '_' + Date.now(), user);
    return user;
  }

  // --- BRANCHES MANAGEMENT (ADMIN ONLY) ---
  async fetchBranches() {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .neq('id', 'admin')
      .order('name', { ascending: true });
      
    if (error) throw new Error('Şubeler getirilemedi: ' + error.message);
    return data;
  }

  async addBranch({ id, name, password }) {
    if (!id || !name || !password) throw new Error('Tüm alanlar zorunludur.');
    if (id.toLowerCase() === 'admin') throw new Error('Bu kullanıcı adı sistem tarafından ayrılmıştır.');

    const { error } = await supabase
      .from('branches')
      .insert([{ id, name, password, status: 'offline' }]);
      
    if (error) throw new Error('Şube eklenemedi: ' + error.message);
  }

  async updateBranch(oldId, { id, name, password }) {
    const updateData = { id, name, password };
    const { error } = await supabase
      .from('branches')
      .update(updateData)
      .eq('id', oldId);
      
    if (error) throw new Error('Şube güncellenemedi: ' + error.message);
  }

  async removeBranch(id) {
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', id);
      
    if (error) throw new Error('Şube silinemedi: ' + error.message);
  }

  // --- SETTINGS (XML CONFIG) ---
  async fetchSettings() {
    const { data, error } = await supabase
      .from('settings')
      .select('*');

    if (error) throw new Error('Ayarlar alınamadı: ' + error.message);
    
    // Map list to key-value object
    const settingsObj = {};
    data.forEach(item => {
      settingsObj[item.key] = item.value;
    });
    return settingsObj;
  }

  async saveSettings(xmlUrl, xmlMappings) {
    const updates = [
      { key: 'xml_url', value: xmlUrl },
      { key: 'xml_mappings', value: JSON.stringify(xmlMappings) }
    ];

    for (const update of updates) {
      const { error } = await supabase
        .from('settings')
        .upsert(update, { onConflict: 'key' });
      if (error) throw new Error(`Ayar kaydedilemedi (${update.key}): ` + error.message);
    }
  }

  // --- XML SAMPLER & XML LOADING ---
  // Fetches a sample product node from the XML feed and returns its child element tags
  async fetchXmlSample(xmlUrl) {
    try {
      const proxyUrl = `/api/proxy-xml?url=${encodeURIComponent(xmlUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('XML çekilemedi.');
      
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
      
      // Look for a node representing a product. 
      // Typically, products are inside a list of child elements. 
      // We will look for elements that have child nodes and list their child tags.
      let firstProductNode = null;
      
      // Recursive function to search for first node with child elements
      const findFirstProduct = (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // If this node has element children and is not the root node, it might be a product
          const elementChildren = Array.from(node.children);
          if (elementChildren.length > 0 && elementChildren.some(child => child.children.length === 0)) {
            firstProductNode = node;
            return true;
          }
          for (const child of elementChildren) {
            if (findFirstProduct(child)) return true;
          }
        }
        return false;
      };

      findFirstProduct(xmlDoc.documentElement);
      
      if (!firstProductNode) {
        throw new Error('Uyumlu ürün düğümü XML içerisinde bulunamadı.');
      }
      
      // Get all child tags of this product
      const tags = Array.from(firstProductNode.children).map(child => child.nodeName);
      return {
        productNodeName: firstProductNode.nodeName,
        tags: Array.from(new Set(tags)) // unique tags
      };
    } catch (err) {
      throw new Error('XML Ayrıştırılamadı: ' + err.message);
    }
  }

  // Downloads the entire XML and parses it into the in-memory Map
  async loadXmlFeed(xmlUrl, mappings) {
    if (this.xmlLoading) return;
    this.xmlLoading = true;
    this.xmlLoaded = false;
    this.xmlProductsMap.clear();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 seconds timeout due to slow XML feeds (e.g. b4b.ozgunes.com.tr)

    try {
      console.log('Ortak XML beslemesi yükleniyor...');
      const proxyUrl = `/api/proxy-xml?url=${encodeURIComponent(xmlUrl)}`;
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('XML yükleme proxy hatası');

      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

      // We will search for all elements matching the mapped product node name or elements with children
      // Let's first extract the product tag name or search for elements with children matching the mapping keys
      const productNodeName = mappings.productNodeName || 'product';
      let productNodes = xmlDoc.getElementsByTagName(productNodeName);

      // Fallback: if tag name is default and not found, search all elements that have children matching mapping keys
      if (productNodes.length === 0) {
        // Find elements that have children representing mapped tags
        const allElements = xmlDoc.getElementsByTagName('*');
        const candidateNodes = [];
        for (const el of allElements) {
          const children = el.children;
          if (children.length > 0) {
            // Check if it has at least barcode and price tags
            let hasBarcode = false;
            for (const child of children) {
              if (child.nodeName.toLowerCase() === mappings.barcode.toLowerCase()) {
                hasBarcode = true;
                break;
              }
            }
            if (hasBarcode) {
              candidateNodes.push(el);
            }
          }
        }
        productNodes = candidateNodes;
      }

      console.log(`XML içerisinde ${productNodes.length} ürün düğümü bulundu.`);

      for (let i = 0; i < productNodes.length; i++) {
        const node = productNodes[i];
        
        let barcodeVal = '';
        let imageVal = '';

        // Extract values using tag mappings
        for (const child of node.children) {
          const tagName = child.nodeName;
          const textContent = child.textContent ? child.textContent.trim() : '';

          if (mappings.barcode && tagName === mappings.barcode) barcodeVal = textContent;
          if (mappings.image && tagName === mappings.image) imageVal = textContent;
        }

        if (barcodeVal) {
          this.xmlProductsMap.set(barcodeVal, {
            image: imageVal
          });
        }
      }

      this.xmlLoaded = true;
      console.log(`XML beslemesi başarıyla belleğe alındı. Toplam: ${this.xmlProductsMap.size} barkod`);
      if (this.xmlProductsMap.size > 0) {
        const sampleKeys = Array.from(this.xmlProductsMap.keys()).slice(0, 3);
        console.log("[DEBUG] XML Cache Örnek Ürünler:", sampleKeys.map(k => ({ barcode: k, data: this.xmlProductsMap.get(k) })));
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('XML beslemesi belleğe alınamadı:', err);
      throw new Error('Ortak XML beslemesi yüklenemedi: ' + err.message);
    } finally {
      this.xmlLoading = false;
    }
  }

  // --- STOCKS MANAGEMENT (UPLOAD & LOOKUP) ---
  // Parses yazar kasa INI file contents. Supports standard INI formats
  parseIniFile(iniText) {
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
      // Discount Rate: 180 to 200 (trimmed) - Price 2 (Discount percentage)
      // Price 4: 220 to 240 (trimmed) - Target Price 4
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
        if (line.length >= 200) {
          const p2Val = line.substring(180, 200).trim().replace(',', '.');
          const discountRate = parseFloat(p2Val) || 0;
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
            
            // 4th price in order: details[4] (if exists and > 0), fallback to details[1] (1st price)
            let priceVal = details[1];
            if (details.length >= 5 && details[4] !== undefined && details[4].trim() !== '') {
              const p4 = parseFloat(details[4].replace(',', '.')) || 0;
              if (p4 > 0) {
                priceVal = details[4];
              }
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

    // Filter out records without barcodes and remove duplicates
    const seenBarcodes = new Set();
    return stocks.filter(item => {
      if (!item.barcode) return false;
      if (seenBarcodes.has(item.barcode)) return false;
      seenBarcodes.add(item.barcode);
      return true;
    });
  }

  // Upload stocks in chunks of 5000 to Supabase (with parallel concurrency 5)
  async uploadStocks(branchId, stockRecords, onProgress) {
    if (!branchId) throw new Error('Şube ID belirtilmedi.');
    
    // Add branch_id to each record
    const records = stockRecords.map(item => ({
      branch_id: branchId,
      barcode: item.barcode,
      name: item.name,
      price: item.price,
      discount_price: item.discount_price || null,
      updated_at: new Date().toISOString()
    }));

    const chunkSize = 5000;
    const chunks = [];
    for (let i = 0; i < records.length; i += chunkSize) {
      chunks.push(records.slice(i, i + chunkSize));
    }
    const totalChunks = chunks.length;
    console.log(`Toplu yükleme başlatıldı: ${records.length} kayıt, ${totalChunks} paket (Eşzamanlılık: 5)...`);

    // Let's first delete existing stocks for this branch to do a clean overwrite
    const { error: delErr } = await supabase
      .from('stocks')
      .delete()
      .eq('branch_id', branchId);

    if (delErr) {
      console.warn('Eski stoklar silinirken hata oluştu (yine de devam ediliyor):', delErr.message);
    }

    let completedChunks = 0;
    let uploadError = null;
    const concurrencyLimit = 5;
    const queue = [...chunks.entries()]; // [index, chunk]

    const worker = async () => {
      while (queue.length > 0 && !uploadError) {
        const item = queue.shift();
        if (!item) break;
        const [index, chunk] = item;

        try {
          const { error } = await supabase
            .from('stocks')
            .insert(chunk);

          if (error) {
            throw new Error(`Paket #${index + 1} yüklenirken hata oluştu: ${error.message}`);
          }

          completedChunks++;
          console.log(`Paket #${index + 1}/${totalChunks} başarıyla yüklendi.`);
          if (onProgress) {
            onProgress(Math.round((completedChunks / totalChunks) * 100));
          }
        } catch (err) {
          uploadError = err;
          throw err;
        }
      }
    };

    // Spawn workers
    const workers = [];
    for (let w = 0; w < Math.min(concurrencyLimit, totalChunks); w++) {
      workers.push(worker());
    }

    // Wait for all workers to finish. If any worker throws an error, Promise.all will reject.
    await Promise.all(workers);

    // If an error was set inside a worker but somehow didn't reject Promise.all
    if (uploadError) {
      throw uploadError;
    }
  }

  // Looks up a barcode for a specific branch and merges it with XML cache
  async getProduct(branchId, barcode) {
    if (!branchId || !barcode) return null;

    // 1. Fetch branch-specific price from Supabase
    const { data: stock, error } = await supabase
      .from('stocks')
      .select('*')
      .eq('branch_id', branchId)
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) {
      console.error('Stok arama hatası:', error.message);
      throw new Error('Veritabanından ürün okunamadı.');
    }

    if (!stock) return null; // Product not in this branch's stock

    // 2. Fetch product details from XML in-memory cache
    const xmlProduct = this.xmlProductsMap.get(barcode) || {};
    console.log(`[DEBUG] Barkod: ${barcode}, Veritabanı (INI):`, { name: stock.name, price: stock.price }, "XML Cache Eşleşmesi:", xmlProduct);

    // 3. Merge and return
    return {
      barcode: stock.barcode,
      // Prefer stock name from INI file, fallback to default
      name: stock.name || 'Barkodlu Ürün',
      price: stock.price, // Branch specific price
      discount_price: stock.discount_price || null, // Campaign/Discount price
      image: xmlProduct.image || '' // Product image from XML
    };
  }

  // Get total stock count for a branch
  async getBranchStockCount(branchId) {
    const { count, error } = await supabase
      .from('stocks')
      .select('*', { count: 'exact', head: true })
      .eq('branch_id', branchId);

    if (error) throw error;
    return count || 0;
  }

  // Get latest stock update time for a branch
  async getBranchLastUpdate(branchId) {
    const { data, error } = await supabase
      .from('stocks')
      .select('updated_at')
      .eq('branch_id', branchId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? data.updated_at : null;
  }

  // Verify branch password directly against database (with offline local fallback)
  async verifyBranchPassword(branchId, enteredPassword) {
    if (!branchId || !enteredPassword) return false;
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('password')
        .eq('id', branchId)
        .maybeSingle();

      if (error) throw error;
      return data && data.password === enteredPassword;
    } catch (err) {
      console.error('Şifre doğrulama hatası:', err);
      return this.currentUser && this.currentUser.password === enteredPassword;
    }
  }
}

export const api = new ApiService();
