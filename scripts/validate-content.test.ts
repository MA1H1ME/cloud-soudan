import { describe, expect, it } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './validate-content';
import { bestChoices, evaluate } from '../src/engine/scoring';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '../content');
const { errors, bundle } = validate(contentDir, true);
const scenario = (id: string) => {
  const s = bundle.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`not found: ${id}`);
  return s;
};

describe('content/', () => {
  it('構造上のエラーがない', () => {
    expect(errors).toEqual([]);
  });

  // 仕様書「13. 最初のシナリオ3本」の判定どおりになっているか
  it('灯さん：S3＋CloudFrontが◎、ウェブサイト機能だけはHTTPS必須条件で×', () => {
    const s = scenario('akari-01');
    expect(bestChoices(s)).toEqual({ hosting: 's3-cloudfront' });
    expect(evaluate(s, { hosting: 's3-website' }).grade).toBe('fail');
    expect(evaluate(s, { hosting: 'ec2-single' }).grade).toBe('fair');
    expect(evaluate(s, { hosting: 'alb-ec2' }).grade).toBe('fail');
  });

  it('柏木さん：コスト優先なのでシングルAZ＋自動バックアップが◎', () => {
    const s = scenario('kashiwagi-01');
    expect(bestChoices(s)).toEqual({ db: 'single-az' });
    expect(evaluate(s, { db: 'multi-az' }).grade).toBe('good');
    expect(evaluate(s, { db: 'read-replica' }).misconceptions).toEqual(['read-replica-failover']);
  });

  it('氷室さん：署名付きURL＋権限を絞ったIAMロールが◎（92.5）', () => {
    const s = scenario('himuro-01');
    const e = evaluate(s, { share: 'presigned-url', credential: 'role-scoped' });
    expect(e.grade).toBe('best');
    expect(e.fit).toBeCloseTo(92.5);
    expect(evaluate(s, { share: 'presigned-url', credential: 'access-key' }).grade).toBe('fail');
  });
});
