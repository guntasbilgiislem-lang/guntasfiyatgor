import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wfmayboaoufumpyejwph.supabase.co';
const supabaseKey = 'sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Supabase veritabanı tohumlanıyor (seeding)...');

  // 1. Şubeleri ekleyelim (Admin dahil)
  const defaultBranches = [
    { id: 'admin', name: 'Merkez Yönetim', password: 'admin123' },
    { id: 'gun001', name: 'Trabzon Meydan', password: 'meydan001' },
    { id: 'gun002', name: 'Akçaabat Merkez', password: 'akcaabat002' },
    { id: 'gun003', name: 'Söğütlü Şube', password: 'sogutlu003' }
  ];

  console.log('Şubeler ekleniyor/güncelleniyor...');
  for (const branch of defaultBranches) {
    const { error } = await supabase
      .from('branches')
      .upsert(branch, { onConflict: 'id' });
    
    if (error) {
      console.error(`❌ Hata (${branch.name}):`, error.message);
    } else {
      console.log(`✅ Başarılı: ${branch.name}`);
    }
  }

  // 2. Varsayılan ayarları ekleyelim
  const defaultSettings = [
    { key: 'xml_url', value: 'https://raw.githubusercontent.com/guntas/sample-feed/main/products.xml' },
    { key: 'xml_mappings', value: '{"barcode":"barkod","name":"urun_adi","price":"fiyat","image":"resim_url"}' }
  ];

  console.log('Ayarlar ekleniyor/güncelleniyor...');
  for (const setting of defaultSettings) {
    const { error } = await supabase
      .from('settings')
      .upsert(setting, { onConflict: 'key' });
    
    if (error) {
      console.error(`❌ Hata (${setting.key}):`, error.message);
    } else {
      console.log(`✅ Başarılı: ${setting.key}`);
    }
  }

  console.log('Tohumlama tamamlandı!');
}

seed();
