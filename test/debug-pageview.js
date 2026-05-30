const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto('http://localhost:5174');
  await page.waitForTimeout(1500);

  // Load FDX content directly
  const fdxPath = path.join(__dirname, 'fixtures', 'matadero.fdx');
  const fdxContent = fs.readFileSync(fdxPath, 'utf8');

  await page.evaluate(async (fdxText) => {
    const shell = document.getElementById('editor-shell');
    const dash = document.getElementById('dashboard');
    if (shell) shell.style.display = '';
    if (dash) dash.style.display = 'none';
    if (typeof appState !== 'undefined') {
      appState.projectId = 'test-project';
      appState.filename = 'matadero.fountain';
    }
    if (typeof fdxToFountain === 'function') {
      const fountain = fdxToFountain(fdxText);
      const editor = document.getElementById('editor');
      if (editor) {
        const lines = fountain.split('\n');
        editor.innerHTML = lines.map(l => `<div>${l || '<br>'}</div>`).join('');
        if (typeof reclassifyAll === 'function') reclassifyAll();
      }
    }
  }, fdxContent);
  await page.waitForTimeout(500);

  // Toggle page view ON
  await page.evaluate(() => {
    if (typeof togglePageView === 'function') togglePageView(true);
  });
  await page.waitForTimeout(300);

  // ========== LIGHT MODE ==========
  // Scroll to page break area
  await page.evaluate(() => {
    const pe = document.querySelector('#editor > div[data-page-end]');
    if (pe) pe.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/Users/quantumcode/CODE/Bestscreen/test/screenshots/pv-light-break.png' });

  // Check key metrics
  const lightMetrics = await page.evaluate(() => {
    const pe = document.querySelector('#editor > div[data-page-end]');
    const ps = document.querySelector('#editor > div[data-page-start]:not([data-page-start="1"])');
    const mid = document.querySelector('#editor > div:not([data-page-end]):not([data-page-start])');
    const stage = document.querySelector('.stage');
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      stageColor: cs(stage)?.backgroundColor,
      pageEndMarginBottom: cs(pe)?.marginBottom,
      pageEndBorderBottom: cs(pe)?.borderBottom,
      pageEndBorderRadius: cs(pe)?.borderRadius,
      pageStartBorderTop: cs(ps)?.borderTop,
      pageStartBorderRadius: cs(ps)?.borderRadius,
      midLineBorderLeft: cs(mid)?.borderLeft,
      midLineMarginBottom: cs(mid)?.marginBottom,
    };
  });
  console.log('LIGHT MODE metrics:', JSON.stringify(lightMetrics, null, 2));

  // ========== DARK MODE ==========
  await page.evaluate(() => {
    // Switch to midnight theme
    document.documentElement.setAttribute('data-theme', 'midnight');
    document.body.setAttribute('data-theme', 'midnight');
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/Users/quantumcode/CODE/Bestscreen/test/screenshots/pv-dark-break.png' });

  const darkMetrics = await page.evaluate(() => {
    const pe = document.querySelector('#editor > div[data-page-end]');
    const ps = document.querySelector('#editor > div[data-page-start]:not([data-page-start="1"])');
    const mid = document.querySelector('#editor > div:not([data-page-end]):not([data-page-start])');
    const stage = document.querySelector('.stage');
    const cs = (el) => el ? getComputedStyle(el) : null;
    return {
      stageColor: cs(stage)?.backgroundColor,
      paperColor: cs(mid)?.backgroundColor,
      pageEndBoxShadow: cs(pe)?.boxShadow,
      pageEndBorderBottom: cs(pe)?.borderBottom,
    };
  });
  console.log('DARK MODE metrics:', JSON.stringify(darkMetrics, null, 2));

  await browser.close();
  console.log('\nDone. Screenshots saved.');
})();
