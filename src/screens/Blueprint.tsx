// 設計図の編集。マスをタップして部品を置き、見積もりと処理能力を見ながら「今月を回す」。
import { useState } from 'react';
import { customerById, ruleById, simByCustomer } from '../content';
import { BlueprintView } from '../components/BlueprintView';
import { PrimaryButton, Screen, pct, yen } from '../components/ui';
import { StepBar } from '../components/StepBar';
import { StaticView } from '../components/StaticView';
import { Senpai } from '../components/Senpai';
import { Term } from '../components/Term';
import { UNLOCK_MONTH } from '../guide';

const SITES = [
  { id: 'ec2', label: 'Amazon EC2 にWebサーバーを立てる', desc: 'サーバー1台。OSから自分で管理する' },
  { id: 's3-website', label: 'Amazon S3 の静的ウェブサイトホスティング', desc: 'バケットを公開して、そのままサイトにする' },
  { id: 's3-cloudfront', label: 'Amazon S3 ＋ Amazon CloudFront', desc: 'バケットは非公開。CloudFront 経由で配信する' },
] as const;
import { go } from '../router';
import { baseCapacity, fixedCost, scalingActive } from '../sim/engine';
import { ASG_COST_PER_DAY, ASG_MAX_EXTRA, EC2_CAPACITY, LOCKED_SLOTS, PARTS, SLOT_LABELS, SLOT_OPTIONS } from '../sim/parts';
import type { Slot } from '../sim/schema';
import { ticketsFrom } from '../sim/tickets';
import { customerSave, partUnlocked, pastResults, planFor, unlockStage, useSave } from '../store';

const PART_TERM: Record<string, string> = { alb: 'alb', ec2: 'ec2', rds: 'rds', 'rds-standby': 'multi-az', 'rds-replica': 'read-replica' };

export function BlueprintScreen({ customerId }: { customerId: string }) {
  const state = useSave();
  const [selected, setSelected] = useState<Slot | null>(null);
  const sim = simByCustomer.get(customerId);
  const save = customerSave(state, customerId);
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  if (!sim || !save || !plan) return <Screen title="設計図が見つかりません"><PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton></Screen>;

  const bp = save.blueprint;
  const inCase = save.phase !== 'operate';
  const name = customerById.get(customerId)?.name ?? customerId;
  const cost = fixedCost(bp, plan.month);
  const isStatic = bp.site !== 'none';
  const cap = baseCapacity(bp);
  const asg = scalingActive(bp);
  const last = pastResults(sim, save).at(-1)?.result;
  const tickets = last ? ticketsFrom(last, ruleById) : [];
  const stage = unlockStage(state);

  return (
    <Screen
      title={`${name}さんの設計図`}
      right={<button type="button" onClick={() => go({ name: 'floor' })} className="text-sm text-slate-500 underline">フロア</button>}
      footer={
        inCase ? (
          <PrimaryButton onClick={() => { state.setPhase(customerId, 'build'); go({ name: 'build', customerId }); }}>③ 構築へ進む</PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => go({ name: 'floor' })}>{save.running ? 'フロアに戻る' : 'この構成でフロアに戻る'}</PrimaryButton>
        )
      }
    >
      {tickets.length > 0 && (
        <ul className="space-y-1 text-sm">
          {tickets.map((t) => <li key={t.id} className="rounded-lg bg-red-50 px-3 py-1.5 text-slate-900">「{t.voice}」</li>)}
        </ul>
      )}

      {save.running && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-800">月の途中は構成を変えられません。月末の報告のあとで直せます。</p>}
      {inCase && <StepBar customerId={customerId} current="design" />}
      {inCase ? <Senpai tip="design" /> : <>{stage >= 2 && <Senpai tip="unlock-2" />}{stage >= 3 && <Senpai tip="unlock-3" />}</>}
      {isStatic ? (
        <>
          <StaticView blueprint={save.running ?? bp} />
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-900">サイトをどこに置いて、どう配信する？</h2>
            {SITES.map((o) => (
              <button
                key={o.id} type="button" aria-pressed={bp.site === o.id} disabled={Boolean(save.running)}
                onClick={() => state.setSite(customerId, o.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${bp.site === o.id ? 'border-2 border-blue-600 bg-blue-50' : 'border border-slate-300'}`}
              >
                <span className="font-bold text-slate-900">{o.label}</span>
                <span className="block text-xs text-slate-600">{o.desc}</span>
              </button>
            ))}
          </section>
        </>
      ) : (
        <>
      <BlueprintView blueprint={save.running ?? bp} selected={save.running ? null : selected} onSelect={save.running ? undefined : setSelected} />

      {save.running ? null : selected ? (
        <section className="rounded-xl border border-slate-300 px-3 py-3" aria-live="polite">
          <h2 className="mb-2 text-sm font-bold text-slate-900">{SLOT_LABELS[selected]}</h2>
          {LOCKED_SLOTS.includes(selected) ? (
            <p className="text-sm text-slate-600">データベースの本体です。外せません。</p>
          ) : (
            <div className="space-y-2">
              {SLOT_OPTIONS[selected].map((p) => {
                const on = bp.slots[selected] === p;
                const open = partUnlocked(state, p);
                return (
                  <div key={p} className={`rounded-lg text-sm ${on ? 'border-2 border-blue-600 bg-blue-50' : 'border border-slate-300'} ${open ? '' : 'bg-slate-50'}`}>
                    <button
                      type="button" aria-pressed={on} disabled={!open}
                      onClick={() => state.setSlot(customerId, selected, p)}
                      className="w-full px-3 pt-2 text-left disabled:text-slate-400"
                    >
                      <span className={`font-bold ${open ? 'text-slate-900' : 'text-slate-400'}`}>{open ? '' : '🔒 '}{PARTS[p].label}</span>
                      <span className="ml-2 text-slate-500">{yen(PARTS[p].cost)}／月</span>
                      <span className="block text-xs text-slate-600">{open ? PARTS[p].desc : `柏木さんの${UNLOCK_MONTH[p]}か月目から使えます`}</span>
                    </button>
                    <p className="px-3 pb-2 text-right text-xs"><Term id={PART_TERM[p]!}>くわしく</Term></p>
                  </div>
                );
              })}
              {bp.slots[selected] && (
                <button type="button" onClick={() => state.setSlot(customerId, selected, null)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">外す</button>
              )}
            </div>
          )}
        </section>
      ) : (
        <p className="text-center text-xs text-slate-500">マスをタップすると、部品を置いたり外したりできます。</p>
      )}

      <section className="space-y-2">
        <label className={`flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm ${bp.slots.public ? '' : 'opacity-50'}`}>
          <span>
            <b><Term id="auto-scaling">Auto Scaling</Term></b>
            <span className="block text-xs text-slate-600">
              {bp.slots.public ? `混んだ日だけ最大${ASG_MAX_EXTRA}台を追加（1台1日 ${yen(ASG_COST_PER_DAY)}）` : 'ALB を置くと使えます'}
            </span>
          </span>
          <input type="checkbox" className="h-5 w-5" disabled={!bp.slots.public} checked={bp.autoScaling} onChange={(e) => state.setSetting(customerId, 'autoScaling', e.target.checked)} />
        </label>
      </section>

        </>
      )}

      <section className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-slate-300 px-3 py-2">
          <p className="text-[11px] text-slate-500">月額の見積もり／予算</p>
          <p className={`font-bold ${cost > plan.budget ? 'text-red-700' : 'text-slate-900'}`}>{yen(cost)}<span className="font-normal text-slate-500">／{yen(plan.budget)}</span></p>
        </div>
        <div className="rounded-lg border border-slate-300 px-3 py-2">
          <p className="text-[11px] text-slate-500">稼働率の目標</p>
          <p className="font-bold text-slate-900">{pct(plan.uptimeTarget)} 以上</p>
        </div>
        {!isStatic && <div className="col-span-2 rounded-lg border border-slate-300 px-3 py-2">
          <p className="text-[11px] text-slate-500">1日にさばける訪問数／ふだんの訪問数</p>
          <p className={`font-bold ${cap < plan.visitsPerDay ? 'text-red-700' : 'text-slate-900'}`}>
            {cap.toLocaleString('ja-JP')}
            {asg && <span className="font-normal text-slate-500">（混雑時は最大 {(cap + ASG_MAX_EXTRA * EC2_CAPACITY).toLocaleString('ja-JP')}）</span>}
            <span className="font-normal text-slate-500">／{plan.visitsPerDay.toLocaleString('ja-JP')}</span>
          </p>
        </div>}
      </section>
      <p className="text-center text-[11px] text-slate-400">金額と処理能力はゲーム内の値です。</p>
    </Screen>
  );
}
