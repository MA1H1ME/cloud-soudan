import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate-content';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '../content');
const { errors } = validate(contentDir, true);
describe('content/', () => {
  it('構造上のエラーがない', () => {
    expect(errors).toEqual([]);
  });

});
