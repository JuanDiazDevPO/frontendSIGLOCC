// Instrumenta el clic dentro del modal: ¿llega el evento al input? ¿donde queda el foco?
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1400,900', '--disable-web-security', `--user-data-dir=${SCRATCH}/chrome-trap`],
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

  // Instrumentar
  await page.evaluate(() => {
    window.__log = [];
    const inp = document.querySelector('.dropzone input[type=file]');
    const lbl = document.querySelector('.dropzone');
    const dlg = document.getElementById('erlModalDialog');
    window.__log.push('input dentro del dialog: ' + (dlg ? dlg.contains(inp) : 'sin dialog'));
    lbl.addEventListener('click', e => window.__log.push(`label click (defaultPrevented=${e.defaultPrevented})`), true);
    lbl.addEventListener('click', e => window.__log.push(`label click BUBBLE (defaultPrevented=${e.defaultPrevented})`));
    inp.addEventListener('click', e => window.__log.push(`INPUT click (defaultPrevented=${e.defaultPrevented})`));
    inp.addEventListener('focus', () => window.__log.push('input FOCUS'));
    document.addEventListener('focusin', e => window.__log.push('focusin -> ' + (e.target.id || e.target.className || e.target.tagName)));
  });

  const dz = await page.$('.dropzone');
  const box = await dz.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise(r => setTimeout(r, 1200));

  const log = await page.evaluate(() => ({
    eventos: window.__log,
    activo: document.activeElement?.id || document.activeElement?.className || document.activeElement?.tagName,
  }));
  console.log(JSON.stringify(log, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
