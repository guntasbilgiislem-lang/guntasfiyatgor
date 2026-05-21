-- 1. Tabloları Oluşturun (Eğer henüz yoksa)
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  status TEXT DEFAULT 'offline'
);

CREATE TABLE IF NOT EXISTS stocks (
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  name TEXT,
  price NUMERIC,
  discount_price NUMERIC,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (branch_id, barcode)
);

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. Row Level Security (RLS) Ayarlarını Kapatın
-- (Uygulamanın şubelerden ve kiosk cihazlarından doğrudan veri okuyup yazabilmesi için)
ALTER TABLE branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE stocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Eğer RLS'yi kapatmak yerine herkese açık izinler (policy) tanımlamak isterseniz aşağıdaki komutları kullanabilirsiniz:
-- DROP POLICY IF EXISTS "Public Access" ON branches;
-- CREATE POLICY "Public Access" ON branches FOR ALL USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Public Access" ON stocks;
-- CREATE POLICY "Public Access" ON stocks FOR ALL USING (true) WITH CHECK (true);
-- DROP POLICY IF EXISTS "Public Access" ON settings;
-- CREATE POLICY "Public Access" ON settings FOR ALL USING (true) WITH CHECK (true);

-- 3. Örnek Verileri Tohumlayın (Seeding)
INSERT INTO branches (id, name, password, status) VALUES 
('admin', 'Merkez Yönetim', 'admin123', 'offline'),
('gun001', 'Trabzon Meydan', 'meydan001', 'offline'),
('gun002', 'Akçaabat Merkez', 'akcaabat002', 'offline'),
('gun003', 'Söğütlü Şube', 'sogutlu003', 'offline')
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, password = EXCLUDED.password;

INSERT INTO settings (key, value) VALUES 
('xml_url', 'https://raw.githubusercontent.com/guntas/sample-feed/main/products.xml'),
('xml_mappings', '{"barcode":"barkod","name":"urun_adi","price":"fiyat","image":"resim_url"}')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value;

-- Tabloları listeleyin ve kontrol edin
SELECT * FROM branches;
SELECT * FROM settings;
