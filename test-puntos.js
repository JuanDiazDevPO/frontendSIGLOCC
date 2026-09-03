const puppeteer = require('puppeteer-core');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:4300';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--window-size=1440,900',
      '--disable-web-security',
      '--user-data-dir=/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad/chrome-profile',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 10000 }).catch(() => {});

  // Find email/password inputs generically
  const emailSel = await page.$('input[type="email"]') ? 'input[type="email"]' : (await page.$('#email') ? '#email' : 'input[name="email"]');
  const passSel = await page.$('input[type="password"]') ? 'input[type="password"]' : (await page.$('#password') ? '#password' : 'input[name="password"]');
  await page.type(emailSel, 'jmunozy@unbosque.edu.co');
  await page.type(passSel, 'region123');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {}),
    page.click('button.btn-primary'),
  ]);

  await new Promise(r => setTimeout(r, 1000));
  console.log('After login URL:', page.url());

  await page.goto(`${BASE}/puntos-entrega`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.topbar-heading', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const heading = await page.$eval('.topbar-heading', el => el.textContent.trim()).catch(() => null);
  console.log('Heading:', heading);

  const navItemExists = await page.$$eval('.nav-item', els => els.some(e => e.textContent.includes('Puntos de Entrega')));
  console.log('Nav item present:', navItemExists);

  const nuevoPuntoBtn = await page.$$eval('button', btns => btns.some(b => b.textContent.includes('Nuevo punto')));
  console.log('Nuevo punto button present (should be false for ENL_RECURSOS):', nuevoPuntoBtn);

  const statsCount = await page.$$eval('.stat-card', els => els.length);
  console.log('Stat cards:', statsCount);

  const resultCount = await page.$eval('.result-count', el => el.textContent.trim()).catch(() => null);
  console.log('Result count text:', resultCount);

  await page.screenshot({ path: '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad/puntos-1-list.png' });

  // toggle view
  const viewBtns = await page.$$('.view-toggle-btn');
  if (viewBtns.length === 2) {
    await viewBtns[0].click();
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad/puntos-2-cards.png' });
  }

  console.log('Console/page errors:', JSON.stringify(errors, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
