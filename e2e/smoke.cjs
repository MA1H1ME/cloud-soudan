const { chromium, devices } = require('playwright');
// 画面の通し確認（スマホ幅）。はじめから → 本編の1か月目 → メールの案件を1件、をエラーなく遊べるか。
// 使い方：npm run build && npx vite preview --port 4173 & npm run e2e
const URL = process.env.E2E_URL ?? 'http://localhost:4173/cloud-soudan/';
const out = process.env.E2E_OUT;
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', d => d.accept());
  const shot = (n, full = false) => (out ? page.screenshot({ path: `${out}/e2e-${n}.png`, fullPage: full }) : Promise.resolve());
  const ok = async () => { await page.waitForTimeout(150); while (await page.getByRole('button', { name: /^(次へ ▶|わかった)$/ }).count()) await page.getByRole('button', { name: /^(次へ ▶|わかった)$/ }).first().click(); };
  const caseFlow = async (fix) => {
    await ok();
    await page.getByRole('button', { name: /② 設計へ/ }).click(); await ok();
    await page.getByText('③ 構築へ進む').click(); await ok();
    await fix();
    await page.getByText(/④ 検証へ/).click(); await ok();
    await page.getByRole('button', { name: /運用を始める/ }).click(); await ok();
  };
  const runMonth = async (who) => {
    await page.getByRole('button', { name: /▶ この構成で/ }).click();
    await page.getByRole('button', { name: /×4/ }).click();
    for (let n = 0; n < 8; n++) {
      const d = page.getByRole('dialog', { name: '障害対応' });
      const rep = page.getByText(/月次レポートを読む/);
      await Promise.race([d.waitFor({ timeout: 40000 }).catch(() => {}), rep.waitFor({ timeout: 40000 }).catch(() => {})]);
      if (await d.count()) {
        console.log('INCIDENT', (await d.innerText()).replace(/\n+/g, ' | ').slice(0, 160));
        await d.getByRole('button').first().click();
        await page.getByText('運用を続ける').click();
        continue;
      }
      break;
    }
    await page.getByText(/月次レポートを読む/).click(); await ok();
    const grade = await page.locator('.stamp').getAttribute('aria-label');
    console.log(who, 'grade', grade);
    if (!grade) throw new Error(`${who}: 月次レポートが出ませんでした`);
    await page.getByRole('button', { name: /^(翌月へ|契約を完了する)$/ }).click();
  };
  await page.goto(URL);
  await page.getByText('はじめから').click();
  for (let i = 0; i < 3; i++) await page.getByText(/タップで続き/).click();
  await page.getByText('決定').click(); await ok();
  await shot('1-floor');
  await page.getByLabel(/PC（メールを開く/).click();
  await shot('2-mail', true);
  await page.getByRole('button', { name: 'この依頼を受ける' }).click(); await ok();
  for (const q of ['止まったら','絶対に失いたくない','セールや宣伝','どんな情報']) await page.getByText(new RegExp(q)).click();
  await caseFlow(async () => {
    await page.getByText('なし', { exact: true }).click();
    await page.locator('select').first().selectOption('web');
    await page.getByText('自動バックアップを有効にする').click();
  });
  await runMonth('kashiwagi m1');
  await ok(); await shot('3-floor-m2');
  // 柏木さんの2か月目を始め、少し時間を進めてメールを待つ（障害対応が出たら答える）
  await page.getByRole('button', { name: /▶ この構成で/ }).click();
  await page.waitForTimeout(1500);
  const d0 = page.getByRole('dialog', { name: '障害対応' });
  if (await d0.count()) { await d0.getByRole('button').first().click(); await page.getByText('運用を続ける').click(); }
  await page.getByRole('button', { name: /停止/ }).click();
  await shot('4-floor-mail');
  await page.getByRole('button', { name: /^メール/ }).click(); await ok();
  await shot('5-mail', true);
  await page.locator('article button[aria-expanded]').first().click();
  await shot('6-mail-open', true);
  await page.getByRole('button', { name: '引き受ける' }).click();
  await caseFlow(async () => {});
  await shot('7-floor-two', true);
  await runMonth('job');
  await shot('8-floor-after', true);
  await browser.close();
  if (errors.length) {
    console.error('画面でエラーが起きました:', errors);
    process.exit(1);
  }
  console.log('e2e: OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
