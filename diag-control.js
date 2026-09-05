// CONTROL: valida que waitForFileChooser realmente detecta el selector en este entorno,
// usando una pagina trivial con el mismo patron label>input. Si el control falla,
// el instrumento no sirve y las conclusiones anteriores son invalidas.
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCRATCH = '/private/tmp/claude-501/-Users-juan-learningProjects-frontendSIGLOCC/8433ffdc-01f3-4760-a0f7-c57bea7d25e2/scratchpad';

const HTML = `<!doctype html><html><body style="font-family:sans-serif">
  <label id="lbl" style="display:block;padding:40px;border:2px dashed #999;text-align:center;cursor:pointer">
    <input id="inp" type="file" style="position:absolute;width:1px;height:1px;clip:rect(0,0,0,0)">
    <span id="txt">Haz clic para seleccionar archivo</span>
  </label>
  <button id="btn" style="margin-top:20px;padding:10px">boton que llama inp.click()</button>
  <script>document.getElementById('btn').onclick = () => document.getElementById('inp').click();</script>
</body></html>`;

(async () => {
  for (const headless of ['new', false]) {
    const browser = await puppeteer.launch({
      executablePath: CHROME, headless,
      args: ['--window-size=900,700', `--user-data-dir=${SCRATCH}/chrome-ctrl-${headless === false ? 'head' : 'less'}`],
    });
    const page = await browser.newPage();
    await page.setContent(HTML);
    await new Promise(r => setTimeout(r, 500));

    const probar = async (sel, etiqueta) => {
      try {
        const el = await page.$(sel);
        const box = await el.boundingBox();
        const [c] = await Promise.all([
          page.waitForFileChooser({ timeout: 3000 }),
          page.mouse.click(box.x + box.width / 2, box.y + box.height / 2),
        ]);
        console.log(`  [headless=${headless}] ${etiqueta}: ABRE`);
        await c.cancel().catch(() => {});
      } catch { console.log(`  [headless=${headless}] ${etiqueta}: no abre`); }
    };

    await probar('#txt', 'label>input clipado (mismo patron que la app)');
    await probar('#btn', 'boton -> inp.click()');
    await browser.close();
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
