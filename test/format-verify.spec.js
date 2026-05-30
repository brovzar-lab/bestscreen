/**
 * Visual format verification script using Playwright.
 * Run with: node test/format-verify.spec.js
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5174';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.error(`  ❌ ${msg}`); }
  }

  try {
    console.log('\n=== Format Verification Test ===\n');
    
    // Load the app
    await page.goto(BASE);
    await page.waitForTimeout(2000);

    // Inject a Fountain screenplay directly via loadFountain
    const testFountain = `Title: Format Test
Credit: Written by
Author: Test Author

INT. CASA DE IRINA - BAÑO - NOCHE #1#

Oscuro. Irina (18) ya está vestida. Un foco. El espejo manchado.

Irina se coloca una argolla en el septum.

EXT. PUEBLO - AMANECER #2#

El cielo apenas gris. Las calles vacías.

INT. CASA DE IRINA - SALA - AMANECER #3#

La tele encendida pinta la sala de azul. Sin volumen.

IRINA
Buenos días, Don Carlos.

DON CARLOS
(sin mirar)
Llegas tarde.
Irina mira el reloj.

CUT TO:

EXT./INT. FOOD MART - ESTACIONAMIENTO - AMANECER #4#

El monolítico edificio de un SUPERMERCADO se dibuja sobre el cielo.

Irina revisa una caja medio vacía de **SALSA VALENTINA**. Suspira.
`;

    await page.evaluate((fountain) => {
      if (typeof loadFountain === 'function') loadFountain(fountain);
    }, testFountain);
    await page.waitForTimeout(1000);

    // ---- Verify scene headings ----
    console.log('--- Scene Headings ---');
    const sceneHeadings = await page.$$eval('#editor > div[data-type="scene"]', els => 
      els.map(el => el.textContent.trim())
    );
    assert(sceneHeadings.length >= 4, `Found ${sceneHeadings.length} scene headings (expected ≥4)`);
    
    for (const h of sceneHeadings) {
      assert(!h.includes('**'), `No ** in: "${h.substring(0,50)}"`);
      assert(!h.includes('/*'), `No /* in: "${h.substring(0,50)}"`);
      assert(!h.includes('#'), `No #num# in: "${h.substring(0,50)}"`);
    }

    // ---- Verify character names ----
    console.log('\n--- Character Names ---');
    const charNames = await page.$$eval('#editor > div[data-type="character"]', els =>
      els.map(el => el.textContent.trim())
    );
    assert(charNames.length >= 2, `Found ${charNames.length} character cues (expected ≥2)`);
    for (const c of charNames) {
      assert(!c.includes('**'), `No ** in character: "${c}"`);
    }

    // ---- Verify dialogue ----
    console.log('\n--- Dialogue ---');
    const dialogues = await page.$$eval('#editor > div[data-type="dialogue"]', els =>
      els.map(el => el.textContent.trim())
    );
    assert(dialogues.length >= 2, `Found ${dialogues.length} dialogue lines (expected ≥2)`);

    // ---- Verify parenthetical ----
    const parens = await page.$$eval('#editor > div[data-type="parenthetical"]', els =>
      els.map(el => el.textContent.trim())
    );
    assert(parens.length >= 1, `Found ${parens.length} parenthetical(s) (expected ≥1)`);

    // ---- Verify transition ----
    const transitions = await page.$$eval('#editor > div[data-type="transition"]', els =>
      els.map(el => el.textContent.trim())
    );
    assert(transitions.length >= 1, `Found ${transitions.length} transition(s) (expected ≥1)`);

    // ---- Verify CSS formatting ----
    console.log('\n--- CSS Formatting ---');
    const sceneStyle = await page.$eval('#editor > div[data-type="scene"]', el => {
      const s = getComputedStyle(el);
      return { fontWeight: s.fontWeight, textTransform: s.textTransform };
    });
    assert(parseInt(sceneStyle.fontWeight) >= 700, `Scene font-weight: ${sceneStyle.fontWeight}`);
    assert(sceneStyle.textTransform === 'uppercase', `Scene text-transform: ${sceneStyle.textTransform}`);

    const charStyle = await page.$eval('#editor > div[data-type="character"]', el => {
      const s = getComputedStyle(el);
      return { marginLeft: s.marginLeft, textTransform: s.textTransform };
    });
    assert(charStyle.textTransform === 'uppercase', `Character text-transform: ${charStyle.textTransform}`);
    const charMargin = parseFloat(charStyle.marginLeft);
    assert(charMargin > 100, `Character margin-left: ${charStyle.marginLeft} (>100px = 2.2in)`);

    const dialogueStyle = await page.$eval('#editor > div[data-type="dialogue"]', el => {
      return { marginLeft: getComputedStyle(el).marginLeft };
    });
    const dlgMargin = parseFloat(dialogueStyle.marginLeft);
    assert(dlgMargin > 50, `Dialogue margin-left: ${dialogueStyle.marginLeft} (>50px = ~1in)`);

    const parenStyle = await page.$eval('#editor > div[data-type="parenthetical"]', el => {
      return { marginLeft: getComputedStyle(el).marginLeft };
    });
    const parenMargin = parseFloat(parenStyle.marginLeft);
    assert(parenMargin > 100, `Parenthetical margin-left: ${parenStyle.marginLeft} (>100px = 1.6in)`);

    const transStyle = await page.$eval('#editor > div[data-type="transition"]', el => {
      const s = getComputedStyle(el);
      return { textAlign: s.textAlign, textTransform: s.textTransform };
    });
    assert(transStyle.textAlign === 'right', `Transition text-align: ${transStyle.textAlign}`);
    assert(transStyle.textTransform === 'uppercase', `Transition text-transform: ${transStyle.textTransform}`);

    // ---- Verify scene numbers in dataset ----
    console.log('\n--- Scene Numbers ---');
    const sceneNums = await page.$$eval('#editor > div[data-type="scene"]', els =>
      els.map(el => ({ text: el.textContent, sceneNum: el.dataset.sceneNum || null }))
    );
    for (const sn of sceneNums) {
      if (sn.sceneNum) {
        assert(!sn.text.includes('#' + sn.sceneNum + '#'), 
          `Scene "${sn.text.substring(0,30)}" has sceneNum=${sn.sceneNum} in dataset, not in text`);
      }
    }

    // ---- No legacy artifacts ----
    console.log('\n--- Content Quality ---');
    const fullHtml = await page.$eval('#editor', el => el.innerHTML);
    assert(!fullHtml.includes('bs:sceneNum'), 'No bs:sceneNum in HTML');
    assert(!fullHtml.includes('BS:SCENENUM'), 'No BS:SCENENUM in HTML');

    // ---- Bold in action lines works ----
    const actionWithBold = await page.$$eval('#editor > div[data-type="action"]', els =>
      els.map(el => el.textContent).filter(t => t.includes('SALSA VALENTINA'))
    );
    assert(actionWithBold.length > 0, 'Bold in action line preserved (SALSA VALENTINA)');

    // Take screenshot
    await page.screenshot({ path: 'format-verify-final.png', fullPage: false });
    console.log('\n📸 Screenshot saved: format-verify-final.png');

    // Summary
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    if (failed > 0) process.exitCode = 1;
  } catch (err) {
    console.error('Test error:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
