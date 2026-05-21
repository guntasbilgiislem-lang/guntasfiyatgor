async function run() {
  const url = 'https://wfmayboaoufumpyejwph.supabase.co/rest/v1/';
  const headers = {
    'apikey': 'sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z',
    'Authorization': 'Bearer sb_publishable_GY7EQ9Gr736oaJpdGjaSow_hxqAzE0z'
  };

  try {
    const res = await fetch(url, { headers });
    console.log('Status:', res.status);
    console.log('Headers:');
    for (const [key, value] of res.headers.entries()) {
      console.log(`${key}: ${value}`);
    }
    const body = await res.text();
    console.log('Body:', body.slice(0, 500));
  } catch (err) {
    console.error('Hata:', err.message);
  }
}

run();
