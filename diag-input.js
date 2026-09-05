// ¿Por que el label no activa al input? Estado del input y clic fisico directo sobre el.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1400,900', '--disable-web-security', `--user-data-dir=${SCRATCH}/chrome-inp`],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  for (let i = 1; i <= 3 && page.url().includes('/login'); i++) {
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.evaluate(() => { document.querySelector('#email').value=''; document.querySelector('#password').value=''; });
    await page.type('#email', 'jmunozy@unbosque.edu.co', { delay: 20 });
    await page.type('#password', 'region123', { delay: 20 });
    await new Promise(r => setTimeout(r, 400));
    await page.click('button.btn-primary');
    await page.waitForFunction(() => !location.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
  }
  if (page.url().includes('/login')) { console.log('FALLO login'); await browser.close(); return; }

  await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('a.nav-item')).find(a => a.textContent.includes('Gestión de reportes'));
    if (l) l.click();
  });
  await new Promise(r => setTimeout(r, 2800));
  await page.evaluate(() => document.querySelector('button.btn-row-edit')?.click());
  await new Promise(r => setTimeout(r, 1000));

  const estado = await page.evaluate(() => {
    const inp = document.querySelector('.dropzone input[type=file]');
    const dz = document.querySelector('.dropzone');
    const cs = getComputedStyle(inp);
    const r = inp.getBoundingClientRect();
    const rd = dz.getBoundingClientRect();
    let inert = null, n = inp;
    while (n && n !== document.body) { if (n.hasAttribute?.('inert') || n.getAttribute?.('aria-hidden') === 'true') { inert = n.className || n.tagName; break; } n = n.parentElement; }
    return {
      disabled: inp.disabled, tipo: inp.type, inertAncestro: inert,
      pointerEvents: cs.pointerEvents, visibility: cs.visibility, display: cs.display,
      inputRect: `x=${Math.round(r.x)} y=${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      dzRect: `x=${Math.round(rd.x)} y=${Math.round(rd.y)} ${Math.round(rd.width)}x${Math.round(rd.height)}`,
      // ¿que elemento hay en el centro del dropzone?
      enCentroDz: (() => { const e = document.elementFromPoint(rd.x + rd.width/2, rd.y + rd.height/2); return e ? (e.className || e.tagName) : null; })(),
      // ¿y en el punto del input?
      enPuntoInput: (() => { const e = document.elementFromPoint(r.x + 0.5, r.y + 0.5); return e ? (e.className || e.tagName) : null; })(),
    };
  });
  console.log('estado input:', JSON.stringify(estado, null, 2));

  // clic fisico DIRECTO sobre el rect del input
  const r = await page.evaluate(() => { const i = document.querySelector('.dropzone input[type=file]').getBoundingClientRect(); return { x: i.x, y: i.y }; });
  try {
    await Promise.all([page.waitForFileChooser({ timeout: 3500 }), page.mouse.click(r.x + 0.5, r.y + 0.5)]);
    console.log('clic directo sobre el input -> ABRE');
  } catch { console.log('clic directo sobre el input -> no abre'); }

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
