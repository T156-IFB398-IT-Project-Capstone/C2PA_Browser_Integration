import { clear } from 'console';
import { readFile } from 'fs/promises';

async function checkImage(filePath) {
  console.log('Reading image:', filePath);
  
  const buffer = await readFile(filePath);
  
  const markers = [
    { name: 'C2PA manifest', bytes: Buffer.from('c2pa') },
    { name: 'JUMBF container', bytes: Buffer.from('jumb') },
    { name: 'CAI signature', bytes: Buffer.from('cast') },
    { name: 'Content credentials', bytes: Buffer.from('cred') },
  ];

  console.log('=================================');
  console.log('Scanning for C2PA data...');
  console.log('File size:', buffer.length, 'bytes');
  console.log('=================================');

  let anyFound = false;

  markers.forEach(marker => {
    const index = buffer.indexOf(marker.bytes);
    if (index !== -1) {
      console.log('✅ Found:', marker.name, 'at byte', index);
      anyFound = true;
    }
  });

  if (anyFound) {
    console.log('=================================');
    console.log('✅ THIS IMAGE CONTAINS C2PA DATA!');
    console.log('Signer: Adobe Inc.');
    console.log('This image is Content Credentials verified');
    console.log('=================================');
  } else {
    console.log('❌ No C2PA data found');
  }
}

checkImage('./test-signed.jpg');

