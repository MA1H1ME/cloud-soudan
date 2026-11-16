// 運用中の障害対応。出来事が起きた日に時間を止め、プレイヤーに対応を選ばせる。
// 選択肢の正誤の根拠は、照合済みのルール（content/rules.yaml）と用語図鑑の範囲に限る。
// 選ぶ前は補正なしで計算する（engine.ts）。defaultId は「何もしなかった」ときに近い選択肢。
import { ASG_COST_PER_DAY, EC2_CAPACITY, SLOW_RATIO } from './parts';
import type { Blueprint, MonthPlan } from './schema';

export interface IncidentEffect {
  /** データベース障害で止まる長さ（日） */
  down?: number;
  /** 混雑の日に足せる処理能力（訪問数） */
  capBoost?: number;
  /** 追加でかかる費用 */
  extraCost?: number;
  /** 損害（もうけ何日分か） */
  penaltyDays?: number;
}

export interface IncidentOption {
  id: string;
  label: string;
  good: boolean;
  /** 選んだあとに出る結果の説明 */
  result: string;
  effect: IncidentEffect;
}

export interface Incident {
  key: string;
  /** 対応の種類。一度正しく答えた種類は、運用担当が代わりに対応できる */
  type: string;
  day: number;
  /** 何が起きたか（お客さん・監視からの知らせ） */
  alert: string;
  question: string;
  options: IncidentOption[];
  defaultId: string;
  /** 解説で開く用語 */
  termId: string;
}

export type Responses = Record<string, string>;

type Ev = MonthPlan['events'][number];

function spikeOverload(ev: Ev, plan: MonthPlan, base: number): boolean {
  const l = plan.visitsPerDay * (1 + 0.005 * (ev.day - 1)) * (ev.factor ?? 2);
  return l > base * SLOW_RATIO;
}

/** その出来事で判断が要るなら、障害対応の問いを返す */
export function incidentFor(ev: Ev, index: number, plan: MonthPlan, bp: Blueprint, base: number, scaling: boolean): Incident | null {
  const key = `${index}`;
  const day = ev.day;
  if (bp.site !== 'none') return null;
  if ((ev.type === 'db-failure' || ev.type === 'az-outage') && bp.slots['data-c'] === 'rds-replica') {
    return {
      key, day, type: 'replica-promote', termId: 'read-replica', defaultId: 'wait',
      alert: `${ev.label}：データベースの本体が応答しません。リードレプリカは動いています。`,
      question: 'どう対応する？',
      options: [
        { id: 'wait', label: 'マルチAZと同じように、自動で切り替わるのを待つ', good: false, effect: { down: 1 },
          result: 'リードレプリカは自動では切り替わりません。本体が戻るまで、丸1日止まりました。' },
        { id: 'promote', label: 'リードレプリカを昇格させ、アプリの接続先を切り替える', good: true, effect: { down: 0.25 },
          result: '昇格と接続先の切り替えで、数時間で再開できました。手作業が要るのが、マルチAZとの違いです。' },
      ],
    };
  }
  if ((ev.type === 'db-failure' || ev.type === 'az-outage') && !bp.slots['data-c'] && bp.backup) {
    return {
      key, day, type: 'backup-restore', termId: 'rds-backup', defaultId: 'overwrite',
      alert: `${ev.label}：データベースが壊れました。自動バックアップはあります。`,
      question: 'どう対応する？',
      options: [
        { id: 'restore', label: 'ある時点への復元で新しいDBインスタンスを作り、アプリの接続先を切り替える', good: true, effect: { down: 0.5 },
          result: '新しいDBインスタンスを作って接続先を切り替え、半日で再開できました。復元を待つ間は止まります。' },
        { id: 'overwrite', label: '今のDBインスタンスに、バックアップが上書きで戻るのを待つ', good: false, effect: { down: 1 },
          result: '復元では、新しいDBインスタンスが作られます。上書きを待っても戻らず、気づくまでに丸1日止まりました。' },
      ],
    };
  }
  if (ev.type === 'spike' && !scaling && base > 0 && spikeOverload(ev, plan, base)) {
    const days = ev.days ?? 2;
    if (bp.slots.public) {
      return {
        key, day, type: 'spike-alb', termId: 'alb', defaultId: 'wait',
        alert: `${ev.label}：アクセスが急に増えて、ページが重くなり始めました。`,
        question: 'どう対応する？',
        options: [
          { id: 'add', label: 'EC2 を1台手で起動し、ALB の振り分け先に登録する', good: true, effect: { capBoost: EC2_CAPACITY, extraCost: ASG_COST_PER_DAY * days },
            result: 'ALB が新しい1台にも振り分け、重さが和らぎました。毎回手でやるなら、Auto Scaling に任せる手もあります。' },
          { id: 'wait', label: '混雑が過ぎるのを待つ', good: false, effect: {},
            result: '混雑の間、買えないお客さんが出ました。' },
        ],
      };
    }
    return {
      key, day, type: 'spike-noalb', termId: 'alb', defaultId: 'wait',
      alert: `${ev.label}：アクセスが急に増えて、ページが重くなり始めました。`,
      question: 'どう対応する？',
      options: [
        { id: 'add', label: 'EC2 をもう1台起動する', good: false, effect: { extraCost: ASG_COST_PER_DAY * days },
          result: '振り分ける ALB がないので、2台目にはアクセスが届きません。料金だけかかりました。' },
        { id: 'wait', label: '混雑が過ぎるのを待ち、振り分け（ALB）を入れる構成をお客さんに提案する', good: true, effect: {},
          result: '今の構成では打つ手がありません。振り分ける仕組みを設計に入れるのが根本の対策です。' },
      ],
    };
  }
  if (ev.type === 'probe' && bp.dbPublic && bp.dbSgOpen) {
    return {
      key, day, type: 'db-sg', termId: 'security-group', defaultId: 'password',
      alert: `${ev.label}：インターネットから、データベースへの接続の試みが続いています。`,
      question: 'まず何をする？',
      options: [
        { id: 'sg', label: 'セキュリティグループの接続元を、Webサーバーのセキュリティグループだけに絞る', good: true, effect: { penaltyDays: 1 },
          result: '外からの通信はすぐ届かなくなりました。ただ、それまでの間に一部が見られた可能性があり、お客さんへの報告が必要です。' },
        { id: 'password', label: 'データベースのパスワードを変えて、様子を見る', good: false, effect: { penaltyDays: 5 },
          result: '通信の入り口は開いたままでした。接続の試みは続き、住所と電話番号が漏れました。' },
      ],
    };
  }
  if (ev.type === 'bucket-probe' && bp.s3Public) {
    return {
      key, day, type: 'bucket-bpa', termId: 's3', defaultId: 'rename',
      alert: `${ev.label}：本人にだけ渡すはずのファイルのURLが、知らない人に共有されています。`,
      question: 'まず何をする？',
      options: [
        { id: 'rename', label: 'ファイル名を推測されにくい名前に変える', good: false, effect: { penaltyDays: 5 },
          result: 'バケットは公開されたままでした。URLを知る人は、ほかのファイルも開けました。' },
        { id: 'bpa', label: 'ブロックパブリックアクセスを有効にし、署名付きURLで渡す方式に切り替える', good: true, effect: { penaltyDays: 1 },
          result: '公開がすぐ止まりました。ただ、それまでに開かれたファイルがあり、患者さんへの報告が必要です。' },
      ],
    };
  }
  if (ev.type === 'audit' && bp.credential === 'access-key') {
    return {
      key, day, type: 'audit-role', termId: 'iam-role', defaultId: 'hide',
      alert: `${ev.label}：サーバーにアクセスキーが保存されていると指摘されました。`,
      question: 'どう答える？',
      options: [
        { id: 'role', label: 'キーを無効にし、必要な権限だけの IAM ロールに切り替える', good: true, effect: { penaltyDays: 1 },
          result: 'その場で直せたので、再審査で通りました。最初からロールにしていれば、この手間はありませんでした。' },
        { id: 'hide', label: 'キーを読み取りにくい別のファイルに移した、と報告する', good: false, effect: { penaltyDays: 3 },
          result: '長期の認証情報が残ったままなので、指摘は解消されず、導入が延期になりました。' },
      ],
    };
  }
  return null;
}

export function chosen(inc: Incident, responses: Responses): IncidentOption {
  const id = responses[inc.key] ?? inc.defaultId;
  return inc.options.find((o) => o.id === id) ?? inc.options.find((o) => o.id === inc.defaultId)!;
}
