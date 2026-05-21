import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wfmayboaoufumpyejwph.supabase.co';
const supabaseKey = 'sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Supabase verileri sorgulanıyor...');
  
  // Query branches
  const { data: branches, error: bErr } = await supabase.from('branches').select('*');
  if (bErr) {
    console.log('Branches hatası:', bErr.message);
  } else {
    console.log('Şubeler (Branches):', branches);
  }

  // Query settings
  const { data: settings, error: sErr } = await supabase.from('settings').select('*');
  if (sErr) {
    console.log('Settings hatası:', sErr.message);
  } else {
    console.log('Ayarlar (Settings):', settings);
  }
}

check();
