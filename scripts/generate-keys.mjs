// Genera el par de claves Ed25519 para firmar licencias.
//   node scripts/generate-keys.mjs
// - LICENSE_PRIVATE_KEY_HEX  -> secret de Supabase (NUNCA en el cliente)
// - LICENSE_PUBLIC_KEY_HEX   -> variable de entorno al compilar el cliente Rust
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
const priv = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url');

console.log('\n=== Claves Ed25519 de licencias ===\n');
console.log(`LICENSE_PRIVATE_KEY_HEX=${priv.toString('hex')}`);
console.log(`LICENSE_PUBLIC_KEY_HEX=${pub.toString('hex')}\n`);
console.log('1) Servidor:  supabase secrets set LICENSE_PRIVATE_KEY_HEX=' + priv.toString('hex'));
console.log('2) Cliente:   $env:LICENSE_PUBLIC_KEY_HEX="' + pub.toString('hex') + '"; pnpm tauri build\n');
console.log('Guarda la clave privada en un lugar seguro. Si se filtra, cualquiera podrá emitir licencias.\n');
