import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:[T6k6V=*8cvIEy]@db.wfmayboaoufumpyejwph.supabase.co:5432/postgres';

async function initDb() {
  const client = new Client({ connectionString });
  
  try {
    console.log('Veritabanına bağlanılıyor...');
    await client.connect();
    console.log('Bağlantı başarılı!');

    // 1. Şubeler Tablosu (branches)
    console.log('branches tablosu oluşturuluyor...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        status TEXT DEFAULT 'offline'
      );
    `);
    console.log('branches tablosu hazır.');

    // 2. Yöneticiler Tablosu (admins)
    console.log('admins tablosu oluşturuluyor...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT DEFAULT 'Merkez Yönetim'
      );
    `);
    console.log('admins tablosu hazır.');

    // 3. Stoklar Tablosu (stocks)
    console.log('stocks tablosu oluşturuluyor...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
        barcode TEXT NOT NULL,
        name TEXT,
        price NUMERIC,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (branch_id, barcode)
      );
    `);
    console.log('stocks tablosu hazır.');

    // 4. Ayarlar Tablosu (settings)
    console.log('settings tablosu oluşturuluyor...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    console.log('settings tablosu hazır.');

    // Örnek Verilerin Eklenmesi
    // Şubeler ekleniyor
    const { rows: branchCount } = await client.query('SELECT COUNT(*) FROM branches');
    if (branchCount[0].count === '0') {
      console.log('Örnek şubeler ekleniyor...');
      await client.query(`
        INSERT INTO branches (id, name, password, status) VALUES 
        ('gun001', 'Trabzon Meydan', 'meydan001', 'offline'),
        ('gun002', 'Akçaabat Merkez', 'akcaabat002', 'offline'),
        ('gun003', 'Söğütlü Şube', 'sogutlu003', 'offline');
      `);
      console.log('Örnek şubeler eklendi.');
    }

    // Admin ekleniyor
    const { rows: adminCount } = await client.query('SELECT COUNT(*) FROM admins');
    if (adminCount[0].count === '0') {
      console.log('Varsayılan yönetici (admin) hesabı ekleniyor...');
      await client.query(`
        INSERT INTO admins (username, password, name) VALUES 
        ('admin', 'admin123', 'Merkez Yönetim');
      `);
      console.log('Varsayılan yönetici eklendi.');
    }

    // Varsayılan Ayarlar ekleniyor
    const { rows: settingsCount } = await client.query('SELECT COUNT(*) FROM settings');
    if (settingsCount[0].count === '0') {
      console.log('Varsayılan ayarlar ekleniyor...');
      await client.query(`
        INSERT INTO settings (key, value) VALUES 
        ('xml_url', 'https://raw.githubusercontent.com/guntas/sample-feed/main/products.xml'),
        ('xml_mappings', '{"barcode":"barkod","name":"urun_adi","price":"fiyat","image":"resim_url"}');
      `);
      console.log('Varsayılan ayarlar eklendi.');
    }

    console.log('Tüm tablolar ve veriler başarıyla kuruldu!');

  } catch (err) {
    console.error('Veritabanı kurulum hatası:', err);
  } finally {
    await client.end();
    console.log('Veritabanı bağlantısı sonlandırıldı.');
  }
}

initDb();
