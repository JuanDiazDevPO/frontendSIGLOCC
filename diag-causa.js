// Aisla POR QUE el clic no abre el selector: prueba variantes de CSS sobre el mismo input.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--window-size=1400,900', '--disable-web-security', `--user-data-dir=${SCRATCH}/chrome-causa`],
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

  const probar = async (etiqueta) => {
    try {
      const dz = await page.$('.dropzone');
      const box = await dz.boundingBox();
      const [c] = await Promise.all([
        page.waitForFileChooser({ timeout: 3500 }),
        page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
      ]);
      console.log(`  ${etiqueta}: ABRE`);
      await c.cancel().catch(() => {});
      return true;
    } catch { console.log(`  ${etiqueta}: no abre`); return false; }
  };

  console.log('Variantes sobre el mismo input:');
  await probar('1. tal como esta (sr-only-input)');

  // Quitar solo el clip
  await page.evaluate(() => { document.querySelector('.dropzone input[type=file]').style.clip = 'auto'; });
  await probar('2. sin clip');

  // Tamaño real y estatico
  await page.evaluate(() => {
    const i = document.querySelector('.dropzone input[type=file]');
    i.style.cssText = 'position:static;width:auto;height:auto;clip:auto;opacity:0';
  });
  await probar('3. estatico + opacity:0');

  // display:none puro
  await page.evaluate(() => {
    const i = document.querySelector('.dropzone input[type=file]');
    i.style.cssText = 'display:none';
  });
  await probar('4. display:none');

  // ¿Y si el clic lo hace el propio input via .click() desde un handler confiable?
  await page.evaluate(() => {
    const dz = document.querySelector('.dropzone');
    dz.addEventListener('click', () => document.querySelector('.dropzone input[type=file]').click(), { once: true });
  });
  await probar('5. handler explicito input.click()');

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
