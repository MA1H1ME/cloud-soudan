// ③ 構築：練習用コンソールで、部品ごとの設定を選ぶ。
// 画面の構造と設定項目の名前は実際のコンソールに合わせるが、配色・アイコン・ロゴは自作。
import { useState, type ReactNode } from 'react';
import { nameFor, simFor } from '../jobs';
import { StepBar } from '../components/StepBar';
import { Senpai } from '../components/Senpai';
import { yen } from '../components/ui';
import { go } from '../router';
import { fixedCost } from '../sim/engine';
import { customerSave, partUnlocked, planFor, useSave } from '../store';
import { UNLOCK_MONTH } from '../guide';

// 「情報」の説明文。content/rules.yaml と同じ公式ドキュメントと照合済み（2026-11-16）。
const HELP_S3 = 'Amazon S3 のバケットとオブジェクトは、デフォルトでは公開されません。ブロックパブリックアクセスは、ポリシーやアクセス許可より優先して公開を制限します。特定の人に渡すときは、署名付きURLで期限つきのアクセスを許可できます。';
const HELP_LIFECYCLE = 'S3 ライフサイクルは、オブジェクトをより低コストのストレージクラスへ移行したり、期限切れのオブジェクトを削除したりして、費用を抑えて保存するのに役立ちます。S3 標準 – IA は、長く保存し、アクセス頻度の低いデータ向けのストレージクラスです。';
const HELP_IAM = 'EC2 に IAM ロールを割り当てると、アプリケーションは一時的な認証情報を受け取って使えます。IAMユーザーの長期の認証情報（アクセスキー）を配る必要がありません。権限は、作業に必要な分だけを与えます（最小権限）。';
const HELP = {
  az: 'マルチ AZ DB インスタンスでは、別のアベイラビリティーゾーンに待機系（スタンバイ）が置かれ、本体から同期的に複製されます。本体に障害が起きると、自動で待機系に切り替わります。待機系を読み取りに使うことはできません。',
  conn: 'パブリックアクセスを「あり」にすると、インターネットから届くパブリックIPアドレスが割り当てられます。セキュリティグループのルールは、届く通信を制御します。接続元には、IPアドレスの範囲のほかに、別のセキュリティグループも指定できます。',
  backup: '自動バックアップを有効にすると、保持期間内の任意の時点にデータベースを復元できます。復元では、新しいDBインスタンスが作られます。保持期間を0にすると、自動バックアップは無効になります。',
};

function Section({ title, summary, help, children }: { title: string; summary: string; help: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [info, setInfo] = useState(false);
  return (
    <section className="border border-slate-300 bg-white">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex-1 text-left text-sm font-bold text-slate-900">
          {open ? '▾' : '▸'} {title}
          {!open && <span className="ml-2 font-normal text-slate-500">{summary}</span>}
        </button>
        <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} className="text-xs text-cyan-700 underline">情報</button>
      </div>
      {info && <p className="border-t border-slate-200 bg-cyan-50 px-3 py-2 text-xs leading-relaxed text-slate-800">{help}</p>}
      {open && <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm">{children}</div>}
    </section>
  );
}

function Radio({ name, checked, onChange, disabled, children }: { name: string; checked: boolean; onChange: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className={`flex items-start gap-2 ${disabled ? 'opacity-60' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 h-4 w-4 accent-teal-600" />
      <span className="text-slate-900">{children}</span>
    </label>
  );
}

export function Build({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simFor(customerId);
  const save = customerSave(state, customerId);
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  if (!sim || !save || !plan) return null;

  const bp = save.running ?? save.blueprint;
  const locked = Boolean(save.running);
  const inCase = save.phase !== 'operate';
  const name = nameFor(customerId);
  const standby = bp.slots['data-c'] === 'rds-standby';
  const replica = bp.slots['data-c'] === 'rds-replica';
  const files = sim.features.includes('files');
  const isStatic = bp.site !== 'none';
  const [service, setService] = useState<'rds' | 's3' | 'iam' | 'site'>(isStatic ? 'site' : 'rds');
  const done = () => {
    if (inCase) {
      state.setPhase(customerId, 'verify');
      go({ name: 'verify', customerId });
    } else go({ name: 'floor' });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-100">
      <header className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: '#0f3d3e' }}>
        <span aria-hidden="true">☰</span>
        <span className="flex-1 rounded px-2 py-1 text-xs text-cyan-100" style={{ background: '#1f5557' }}>サービスを検索</span>
        <span className="text-xs">東京 ▾</span>
      </header>
      <p className="bg-teal-100 py-1 text-center text-[11px] text-teal-900">練習用・非公式。AWSとは関係ありません</p>

      <main className="flex-1 space-y-3 px-3 py-3">
        {inCase && <StepBar customerId={customerId} current="build" />}
        <Senpai tip="build" />
        {files && (
          <nav className="flex gap-1 text-xs" aria-label="サービス">
            {([['rds', 'Amazon RDS'], ['s3', 'Amazon S3'], ['iam', 'IAM']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={service === id} onClick={() => setService(id)} className={`flex-1 border py-2 ${service === id ? 'border-teal-700 bg-white font-bold text-teal-800' : 'border-slate-300 bg-slate-50 text-slate-600'}`}>{label}</button>
            ))}
          </nav>
        )}
        {locked && <p className="bg-amber-50 px-3 py-2 text-sm text-slate-800">月の途中は設定を変えられません。月末の報告のあとで直せます。</p>}
        {service === 'rds' && (<>
        <p className="text-xs text-cyan-700">Amazon RDS ＞ データベース ＞ {name}さんの注文DB ＞ 変更</p>
        <h1 className="text-lg font-bold text-slate-900">データベースを変更</h1>

        <Section title="エンジンのオプション" summary="MySQL" help="このゲームでは、エンジンは MySQL で固定です。">
          <p className="text-slate-700">MySQL</p>
        </Section>

        <Section title="可用性と耐久性" summary={standby ? 'マルチ AZ' : 'シングル AZ'} help={HELP.az}>
          <p className="text-xs text-slate-500">デプロイメントオプション</p>
          <Radio name="az" checked={!standby} disabled={locked} onChange={() => state.setSlot(customerId, 'data-c', null)}>シングル AZ DB インスタンス</Radio>
          <Radio name="az" checked={standby} disabled={locked || !partUnlocked(state, 'rds-standby')} onChange={() => state.setSlot(customerId, 'data-c', 'rds-standby')}>
            {partUnlocked(state, 'rds-standby') ? '' : '🔒 '}マルチ AZ DB インスタンス（スタンバイあり）
            {!partUnlocked(state, 'rds-standby') && <span className="block text-xs text-slate-500">柏木さんの{UNLOCK_MONTH['rds-standby']}か月目から使えます</span>}
          </Radio>
          {replica && <p className="text-xs text-slate-500">設計図でリードレプリカを置いています。ここを選び直すと、レプリカは外れます。</p>}
        </Section>

        <Section title="接続" summary={`パブリックアクセス ${bp.dbPublic ? 'あり' : 'なし'}`} help={HELP.conn}>
          <p className="text-xs text-slate-500">パブリックアクセス</p>
          <div className="flex gap-6">
            <Radio name="public" checked={bp.dbPublic} disabled={locked} onChange={() => state.setSetting(customerId, 'dbPublic', true)}>あり</Radio>
            <Radio name="public" checked={!bp.dbPublic} disabled={locked} onChange={() => state.setSetting(customerId, 'dbPublic', false)}>なし</Radio>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500">VPC セキュリティグループ（インバウンドルール）</span>
            <select
              value={bp.dbSgOpen ? 'open' : 'web'} disabled={locked}
              onChange={(e) => state.setSetting(customerId, 'dbSgOpen', e.target.value === 'open')}
              className="mt-1 block w-full border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              <option value="open">db-sg：MySQL(3306) を 0.0.0.0/0 から許可</option>
              <option value="web">db-sg：MySQL(3306) を web-sg からのみ許可</option>
            </select>
          </label>
        </Section>

        <Section title="追加設定（バックアップ）" summary={bp.backup ? '有効' : '無効'} help={HELP.backup}>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={bp.backup} disabled={locked} onChange={(e) => state.setSetting(customerId, 'backup', e.target.checked)} className="h-4 w-4 accent-teal-600" />
            <span className="text-slate-900">自動バックアップを有効にする</span>
          </label>
          <p className="text-xs text-slate-500">バックアップ保持期間：{bp.backup ? '7日' : '—'}</p>
        </Section>

        </>)}
        {service === 's3' && (<>
          <p className="text-xs text-cyan-700">Amazon S3 ＞ バケット ＞ 検査結果のPDF ＞ アクセス許可</p>
          <h1 className="text-lg font-bold text-slate-900">バケットのアクセス許可を編集</h1>
          <Section title="ブロックパブリックアクセス" summary={bp.s3Public ? 'オフ（公開）' : 'オン'} help={HELP_S3}>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={!bp.s3Public} disabled={locked} onChange={(e) => state.setSetting(customerId, 's3Public', !e.target.checked)} className="mt-1 h-4 w-4 accent-teal-600" />
              <span className="text-slate-900">パブリックアクセスをすべてブロック</span>
            </label>
            <p className="text-xs text-slate-500">{bp.s3Public ? '現在：URLを知っていれば誰でもファイルを開けます' : '現在：非公開。本人には、アプリが期限つきの署名付きURLを発行します'}</p>
          </Section>
        </>)}
        {service === 'site' && (<>
          <p className="text-xs text-cyan-700">Amazon S3 ＞ バケット ＞ ブログの写真 ＞ 管理</p>
          <h1 className="text-lg font-bold text-slate-900">ライフサイクルルール</h1>
          {bp.site === 'ec2' ? (
            <p className="bg-white px-3 py-3 text-sm text-slate-700">今はサイトを Amazon EC2 に置いています。Amazon S3 の設定は、② 設計で置き場所を S3 にすると使えます。</p>
          ) : (
            <Section title="ライフサイクルルール" summary={bp.lifecycle ? 'あり' : 'なし'} help={HELP_LIFECYCLE}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={bp.lifecycle} disabled={locked} onChange={(e) => state.setSetting(customerId, 'lifecycle', e.target.checked)} className="mt-1 h-4 w-4 accent-teal-600" />
                <span className="text-slate-900">作成から30日たった写真を、S3 標準 – IA へ移行する</span>
              </label>
            </Section>
          )}
        </>)}
        {service === 'iam' && (<>
          <p className="text-xs text-cyan-700">IAM ＞ アプリ（EC2）から Amazon S3 へのアクセス</p>
          <h1 className="text-lg font-bold text-slate-900">アプリに権限を渡す方法</h1>
          <Section title="認証情報と権限" summary="" help={HELP_IAM}>
            <Radio name="cred" checked={bp.credential === 'access-key'} disabled={locked} onChange={() => state.setCredential(customerId, 'access-key')}>IAM ユーザーのアクセスキーを、サーバーの設定ファイルに保存する</Radio>
            <Radio name="cred" checked={bp.credential === 'role-full'} disabled={locked} onChange={() => state.setCredential(customerId, 'role-full')}>EC2 に IAM ロールを割り当てる（AmazonS3FullAccess）</Radio>
            <Radio name="cred" checked={bp.credential === 'role-scoped'} disabled={locked} onChange={() => state.setCredential(customerId, 'role-scoped')}>EC2 に IAM ロールを割り当てる（検査結果のバケットへの読み書きだけを許可）</Radio>
          </Section>
        </>)}

        <div className="flex items-center justify-between bg-white px-3 py-2 text-sm">
          <span className="text-slate-500">推定月額（構成全体・ゲーム内の値）</span>
          <span className={`font-bold ${fixedCost(bp, plan.month) > plan.budget ? 'text-red-700' : 'text-slate-900'}`}>{yen(fixedCost(bp, plan.month))}<span className="font-normal text-slate-500">／{yen(plan.budget)}</span></span>
        </div>
      </main>

      <footer className="sticky bottom-0 flex gap-2 border-t border-slate-300 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => go(inCase ? { name: 'blueprint', customerId } : { name: 'floor' })} className="border border-slate-300 px-4 py-2 text-sm">{inCase ? '② 設計に戻る' : 'キャンセル'}</button>
        <button type="button" onClick={done} className="flex-1 py-2 text-sm font-bold text-white" style={{ background: '#0d9488' }}>
          {inCase ? '変更を保存して ④ 検証へ' : '変更を保存'}
        </button>
      </footer>
    </div>
  );
}
