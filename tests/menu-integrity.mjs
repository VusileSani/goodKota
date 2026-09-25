import assert from 'node:assert/strict';
import {seed} from '../js/data/seed.js';

const productIds = new Set();
for (const merchant of seed.merchants) {
  const ids = new Set();
  for (const product of merchant.menu) {
    assert(!productIds.has(product.id), `Duplicate product ${product.id}`);
    productIds.add(product.id);
    assert(Number.isInteger(product.price) && product.price > 0);
    for (const option of product.choices || []) {
      assert(!ids.has(option.id), `Duplicate choice ${option.id}`);
      ids.add(option.id);
    assert(['add','remove','select'].includes(option.kind));
      assert(Number.isInteger(option.price) && option.price >= 0);
    if (option.kind === 'remove') assert.equal(option.price, 0);
    if (option.kind === 'select') assert(option.group?.trim(), `Choice group missing for ${option.id}`);
    }
  }
}
assert(seed.merchants.some(merchant => merchant.menu.some(item => item.choices?.some(option => option.kind === 'add'))));
assert(seed.merchants.some(merchant => merchant.menu.some(item => item.choices?.some(option => option.kind === 'remove'))));
assert(seed.merchants.some(merchant => merchant.menu.some(item => item.choices?.some(option => option.kind === 'select'))));
console.log('Menu integrity passed.');
