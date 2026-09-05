// Reproduce el sintoma real: hacer CLIC en el dropzone y ver si abre el selector de archivos.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1400,900', '--disable-web-security', `--user-data-dir=${SCRATCH}/chrome-click`],
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

  // Estructura DOM: ¿el input está realmente dentro del label y asociado?
  const dom = await page.evaluate(() => {
    const inp = document.querySelector('.dropzone input[type=file]');
    if (!inp) return { hayInput: false };
    return {
      hayInput: true,
      padreEsLabel: inp.parentElement?.tagName,
      labelsAsociados: inp.labels ? inp.labels.length : 'n/a',
      rect: (() => { const r = inp.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })(),
    };
  });
  console.log('DOM:', JSON.stringify(dom));

  // 1) CLIC REAL sobre el texto "Haz clic para seleccionar archivo"
  let chooserAbrio = false;
  try {
    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 4000 }),
      page.evaluate(() => {
        const t = document.querySelector('.dropzone__title');
        const r = t.getBoundingClientRect();
        t.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      }),
    ]);
    chooserAbrio = !!chooser;
  } catch { chooserAbrio = false; }
  console.log('A) click JS sobre el texto -> abre selector:', chooserAbrio ? 'SI' : 'NO');

  // 2) CLIC físico del mouse en el centro del dropzone
  let chooser2 = false;
  try {
    const dz = await page.$('.dropzone');
    const box = await dz.boundingBox();
    const [c] = await Promise.all([
      page.waitForFileChooser({ timeout: 4000 }),
      page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    ]);
    chooser2 = !!c;
  } catch { chooser2 = false; }
  console.log('B) clic físico del mouse  -> abre selector:', chooser2 ? 'SI' : 'NO');

  await page.screenshot({ path: `${SCRATCH}/click-diag.png` });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
