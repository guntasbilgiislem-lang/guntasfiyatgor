import dns from 'dns';

async function run() {
  const targetIp = '2406:da1c:4c7:f801:aaa2:5750:2386:3317';
  console.log(`Hedef IPv6: ${targetIp}`);

  try {
    console.log('AWS IP aralıkları indiriliyor...');
    const response = await fetch('https://ip-ranges.amazonaws.com/ip-ranges.json');
    if (!response.ok) throw new Error('AWS IP listesi indirilemedi.');
    const data = await response.json();

    console.log('IPv6 aralıkları taranıyor...');
    // We need to parse and compare IPv6 CIDR blocks
    // Since we don't have ipaddr.js, let's convert the IP address and prefixes to binary or hex strings
    const targetHex = ipToHex(targetIp);
    console.log(`Hedef IP Hex: ${targetHex}`);

    let match = null;
    for (const prefix of data.ipv6_prefixes) {
      if (ipInCidr(targetHex, prefix.ipv6_prefix)) {
        console.log(`Eşleşen CIDR: ${prefix.ipv6_prefix} -> Bölge: ${prefix.region} (Servis: ${prefix.service})`);
        match = prefix;
      }
    }

    if (!match) {
      console.log('Eşleşen AWS bölgesi bulunamadı.');
    }
  } catch (err) {
    console.error('Hata:', err.message);
  }
}

function ipToHex(ip) {
  // Expand shorted IPv6 (e.g. 2406:da1c:4c7:f801:aaa2:5750:2386:3317)
  const parts = ip.split(':');
  let expandedParts = [];
  
  for (let part of parts) {
    if (part === '') {
      const missingCount = 8 - parts.filter(p => p !== '').length;
      for (let i = 0; i < missingCount; i++) {
        expandedParts.push('0000');
      }
    } else {
      expandedParts.push(part.padStart(4, '0'));
    }
  }
  
  return expandedParts.join('').toLowerCase();
}

function ipInCidr(ipHex, cidr) {
  const [prefix, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const prefixHex = ipToHex(prefix);

  const charCount = Math.ceil(bits / 4);
  const ipSub = ipHex.slice(0, charCount);
  const prefixSub = prefixHex.slice(0, charCount);

  if (bits % 4 === 0) {
    return ipSub === prefixSub;
  }

  // Handle bit-level comparison for the boundary character if bits is not a multiple of 4
  const fullBytesMatch = ipHex.slice(0, Math.floor(bits / 4)) === prefixHex.slice(0, Math.floor(bits / 4));
  if (!fullBytesMatch) return false;

  const boundaryBitOffset = bits % 4;
  const boundaryCharIndex = Math.floor(bits / 4);
  
  const ipCharVal = parseInt(ipHex[boundaryCharIndex], 16);
  const prefixCharVal = parseInt(prefixHex[boundaryCharIndex], 16);

  const mask = (0xF0 >> (boundaryBitOffset - 1)) & 0xF;
  return (ipCharVal & mask) === (prefixCharVal & mask);
}

run();
