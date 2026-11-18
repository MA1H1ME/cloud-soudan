// 部品の一覧。金額と処理能力はゲーム内の値で、実際の料金や性能ではない。
import type { PartType, Slot } from './schema';

export const PARTS: Record<PartType, { label: string; cost: number; desc: string }> = {
  alb: { label: 'ALB', cost: 5000, desc: 'アクセスを複数のサーバーに振り分ける' },
  ec2: { label: 'EC2', cost: 6000, desc: 'Webサーバー1台' },
  rds: { label: 'RDS', cost: 8000, desc: 'データベース（本体）' },
  'rds-standby': { label: 'スタンバイ', cost: 8000, desc: 'マルチAZ配置の待機系' },
  'rds-replica': { label: 'リードレプリカ', cost: 8000, desc: '読み取り専用の複製' },
};

export const SLOT_OPTIONS: Record<Slot, PartType[]> = {
  public: ['alb'],
  'app-a': ['ec2'],
  'app-c': ['ec2'],
  'data-a': ['rds'],
  'data-c': ['rds-standby', 'rds-replica'],
};

export const SLOT_LABELS: Record<Slot, string> = {
  public: 'パブリックサブネット',
  'app-a': 'AZ-a・アプリ層',
  'app-c': 'AZ-c・アプリ層',
  'data-a': 'AZ-a・データ層',
  'data-c': 'AZ-c・データ層',
};

/** 外せないマス（データベース本体） */
export const LOCKED_SLOTS: Slot[] = ['data-a'];

export const BACKUP_COST = 500;
export const NAT_COST = 4500; // NAT ゲートウェイ（ゲーム内の値）
export const EC2_CAPACITY = 1500; // 1台が1日にさばける訪問数
export const ASG_MAX_EXTRA = 2; // Auto Scaling が一時的に足せる台数
export const ASG_COST_PER_DAY = 400; // 足した1台・1日あたり
export const SLOW_RATIO = 0.9; // 負荷が処理能力のこの割合を超えた日は「重い日」
export const SLOW_DAYS_ALLOWED = 2;
