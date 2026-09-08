import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hash = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

const approvedLogo = '501d203be887d05f4403139f079d890c0583ce37bd27d0abd8ede4a0103bd5b2';
const approvedSplash = 'efb741b463fd64363d292161afbcf6bfc9cc19b821c02113f3b0a2a5e0312c5a';

assert.equal(await hash(new URL('../assets/yagoya-logo.png', import.meta.url)), approvedLogo,
  'Approved Yagoya logo artwork must remain unchanged without explicit rebrand approval.');
assert.equal(await hash(new URL('../assets/yagoya-splash.jpg', import.meta.url)), approvedSplash,
  'Approved Yagoya splash artwork must remain unchanged without explicit rebrand approval.');

const styles = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const website = await readFile(new URL('../css/website.css', import.meta.url), 'utf8');
assert.match(styles, /#f15a29/i, 'Established orange UI palette must remain present.');
assert.match(website, /--orange:#f15a29/i, 'Website must retain the established orange brand palette.');

console.log('brand-continuity: 4/4');
