// Verifica los 2 sintomas reportados: (1) clic abre el selector, (2) se puede arrastrar archivos.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1400,900', '--disable-web-security', `--user-data-dir=${SCRATCH}/chrome-verifydz`],
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

  // (1) CLIC FISICO -> ¿abre el selector?
  let abre = false;
  try {
    const dz = await page.$('.dropzone');
    const box = await dz.boundingBox();
    const [c] = await Promise.all([
      page.waitForFileChooser({ timeout: 4000 }),
      page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
    ]);
    abre = true;
    await c.cancel().catch(() => {});
  } catch { abre = false; }
  console.log('1) clic fisico abre el selector:', abre ? 'SI ✅' : 'NO ❌');

  // (2) DRAG & DROP simulado con DataTransfer real
  const drop = await page.evaluate(async () => {
    const dz = document.querySelector('.dropzone');
    const dt = new DataTransfer();
    dt.items.add(new File(['%PDF-1.4 test'], 'arrastrado.pdf', { type: 'application/pdf' }));
    dz.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const resaltado = dz.classList.contains('dropzone--dragging');
    dz.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 600));
    return {
      resaltadoAlArrastrar: resaltado,
      archivoMostrado: document.querySelector('.dropzone__file-name')?.textContent.trim() ?? null,
      submitHabilitado: !document.querySelector('.btn-confirm')?.disabled,
    };
  });
  console.log('2) drag & drop:', JSON.stringify(drop));

  // (3) rechazo de tipo invalido
  const invalido = await page.evaluate(async () => {
    const dz = document.querySelector('.dropzone');
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'foto.png', { type: 'image/png' }));
    dz.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 500));
    return document.querySelector('.field-error')?.textContent.trim() ?? null;
  });
  console.log('3) drop de .png ->', invalido);

  await page.screenshot({ path: `${SCRATCH}/dropzone-fix.png` });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
