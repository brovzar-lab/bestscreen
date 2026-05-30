import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the FDX fixture
const fdxXml = readFileSync(join(__dirname, 'fixtures/matadero.fdx'), 'utf-8');

// Standalone copy of fdxToFountain for testing (mirrors io.js)
function fdxToFountain(xml) {
  const doc = new (new JSDOM()).window.DOMParser().parseFromString(xml, "application/xml");
  let out = "";

  function paraText(p, paragraphType) {
    const texts = Array.from(p.querySelectorAll(":scope > Text"));
    if (texts.length === 0) return (p.textContent || "").trim();
    const skipBold = ["Scene Heading", "Character", "Transition"].includes(paragraphType);
    return texts.map(t => {
      let s = t.textContent || "";
      const style = (t.getAttribute("Style") || "").toLowerCase();
      if (!style) return s;
      const hasBold = style.includes("bold");
      const hasItalic = style.includes("italic");
      const applyBold = hasBold && !skipBold;
      if (applyBold && hasItalic) s = `***${s}***`;
      else if (applyBold) s = `**${s}**`;
      else if (hasItalic) s = `*${s}*`;
      if (style.includes("underline")) s = `_${s}_`;
      return s;
    }).join("").trim();
  }
  function sceneNum(p) {
    const sp = p.querySelector("SceneProperties");
    if (sp) { const num = sp.getAttribute("Number") || ""; if (num) return num; }
    return p.getAttribute("Number") || "";
  }
  function stripContd(name) {
    return name.replace(/\s*\(CONT'?D\)\s*$/i, "").trim();
  }

  // ---- Try structured <TitlePage> first ----
  const titlePage = doc.querySelector("TitlePage");
  if (titlePage) {
    const tpParas = titlePage.querySelectorAll("Content > Paragraph");
    const tpMap = {};
    tpParas.forEach(p => {
      const type = (p.getAttribute("Type") || "").trim();
      const texts = Array.from(p.querySelectorAll("Text"));
      const val = texts.map(t => (t.textContent || "").trim()).filter(Boolean).join(" ");
      if (!val) return;
      if (!tpMap[type]) tpMap[type] = val;
    });
    if (tpMap["Title"] || tpMap[""])   out += `Title: ${tpMap["Title"] || tpMap[""]}\n`;
    if (tpMap["Credit"])              out += `Credit: ${tpMap["Credit"]}\n`;
    if (tpMap["Author"])              out += `Author: ${tpMap["Author"]}\n`;
    if (tpMap["Source"])              out += `Source: ${tpMap["Source"]}\n`;
    if (tpMap["Draft date"])          out += `Draft date: ${tpMap["Draft date"]}\n`;
    if (tpMap["Contact"])             out += `Contact: ${tpMap["Contact"]}\n`;
    if (!out) {
      const rawTexts = Array.from(titlePage.querySelectorAll("Paragraph Text"))
        .map(t => (t.textContent || "").trim()).filter(Boolean);
      if (rawTexts.length) {
        out += `Title: ${rawTexts[0]}\n`;
        if (rawTexts[1]) out += `Credit: ${rawTexts[1]}\n`;
        if (rawTexts[2]) out += `Author: ${rawTexts[2]}\n`;
      }
    }
    if (out) out += "\n";
  }

  const content = doc.querySelector("FinalDraft > Content");
  if (!content) return out;
  const topChildren = Array.from(content.children);

  // ---- Detect embedded title page (no <TitlePage> tag) ----
  if (!out) {
    const firstSceneIdx = topChildren.findIndex(node => {
      if (node.tagName !== "Paragraph") return false;
      return (node.getAttribute("Type") || "") === "Scene Heading";
    });
    if (firstSceneIdx > 0) {
      const tpTexts = [];
      for (let i = 0; i < firstSceneIdx; i++) {
        const node = topChildren[i];
        if (node.tagName !== "Paragraph") continue;
        const type = node.getAttribute("Type") || "General";
        const alignment = (node.getAttribute("Alignment") || "").toLowerCase();
        if (type !== "General" && type !== "Title") break;
        if (alignment !== "center") break;
        tpTexts.push({ text: paraText(node, type), type });
      }
      const nonEmpty = tpTexts.filter(t => t.text);
      if (nonEmpty.length > 0) {
        let title = "", credit = "", author = "", date = "", source = "", contact = "";
        const texts = nonEmpty.map(t => t.text);
        for (let i = 0; i < texts.length; i++) {
          const t = texts[i];
          if (nonEmpty[i].type === "Title" && !title) { title = t; continue; }
          if (!title && i === 0) { title = t; continue; }
          if (/^(written by|escrito por|screenplay by|script by|by)$/i.test(t)) { credit = t; continue; }
          if (credit && !author) { author = t; continue; }
          if (author && !author.includes("\n") && /^[A-ZÁÉÍÓÚÑ]/.test(t) && !/^\d/.test(t) &&
              !/(version|revision|draft|fecha)/i.test(t)) { author += "\n" + t; continue; }
          if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(t)) { date = t; continue; }
          if (/^(\d+\w*\s+)?(version|versión|draft|borrador)/i.test(t)) { source = t; continue; }
          if (/^revision$/i.test(t)) {
            if (i + 1 < texts.length) { contact = "Revision: " + texts[i + 1]; i++; }
            continue;
          }
        }
        if (title) out += `Title: ${title}\n`;
        if (credit) out += `Credit: ${credit}\n`;
        if (author) out += `Author: ${author}\n`;
        if (source) out += `Source: ${source}\n`;
        if (date) out += `Draft date: ${date}\n`;
        if (contact) out += `Contact: ${contact}\n`;
        if (out) out += "\n";
      }
    }
  }

  const firstSceneIdx = topChildren.findIndex(node => {
    if (node.tagName !== "Paragraph") return false;
    return (node.getAttribute("Type") || "") === "Scene Heading";
  });

  let prevType = "";
  for (let ci = 0; ci < topChildren.length; ci++) {
    const node = topChildren[ci];

    if (out && firstSceneIdx > 0 && ci < firstSceneIdx && node.tagName === "Paragraph") {
      const type = node.getAttribute("Type") || "General";
      const alignment = (node.getAttribute("Alignment") || "").toLowerCase();
      if ((type === "General" || type === "Title") && alignment === "center") continue;
    }

    if (node.tagName === "DualDialogue") {
      const ddParas = Array.from(node.querySelectorAll("Paragraph"));
      let charCount = 0;
      for (let di = 0; di < ddParas.length; di++) {
        const p = ddParas[di];
        if (p.closest("TitlePage")) continue;
        const type = p.getAttribute("Type") || "Action";
        let text = paraText(p, type);
        if (!text && type !== "Action") continue;
        if (type === "Character") {
          charCount++; text = stripContd(text);
          if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
          const charPrefix = (text !== text.toUpperCase()) ? "@" : "";
          out += charCount === 2 ? charPrefix + text + " ^\n" : charPrefix + text + "\n";
          prevType = "Character";
        } else if (type === "Dialogue") {
          if (/^\(MORE\)$/i.test(text.trim())) continue;
          out += text + "\n"; prevType = "Dialogue";
        } else if (type === "Parenthetical") {
          out += text + "\n"; prevType = "Parenthetical";
        } else {
          out += text + "\n\n"; prevType = type;
        }
      }
      if (!out.endsWith("\n\n")) out += "\n";
      continue;
    }

    if (node.tagName !== "Paragraph") continue;
    const p = node;
    if (p.closest("TitlePage")) continue;
    const type = p.getAttribute("Type") || "Action";
    let text = paraText(p, type);

    if (!text) {
      if (prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
      prevType = "blank"; continue;
    }
    if (/^\(MORE\)$/i.test(text.trim())) continue;

    const sn = sceneNum(p);
    const snSuffix = sn ? ` #${sn}#` : "";

    switch (type) {
      case "Scene Heading":
        if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
        out += text + snSuffix + "\n\n"; break;
      case "Action":
      case "General":
        if ((p.getAttribute("Alignment") || "").toLowerCase() === "center") {
          out += "> " + text + " <\n\n";
        } else {
          out += text + "\n\n";
        }
        break;
      case "Character":
        text = stripContd(text);
        if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
        if (text !== text.toUpperCase()) {
          out += "@" + text + "\n";
        } else {
          out += text + "\n";
        }
        break;
      case "Dialogue":      out += text + "\n"; break;
      case "Parenthetical": out += text + "\n"; break;
      case "Transition":
        if (prevType && prevType !== "blank" && !out.endsWith("\n\n")) out += "\n";
        out += "> " + text + "\n\n"; break;
      case "Lyrics":        out += "~" + text + "\n\n"; break;
      default:              out += text + "\n\n";
    }
    prevType = type;
  }
  return out.replace(/\n{3,}/g, "\n\n");
}


describe('FDX Parser (fdxToFountain)', () => {
  let fountain;

  beforeAll(() => {
    fountain = fdxToFountain(fdxXml);
    console.log("=== GENERATED FOUNTAIN ===");
    console.log(fountain);
    console.log("=== END ===");
  });

  it('should extract title page fields', () => {
    expect(fountain).toContain('Title: Matadero');
    expect(fountain).toContain('Credit: Escrito por');
    expect(fountain).toContain('Author: Mariano Borgognone');
    expect(fountain).toContain('Source: 5ta Version');
    expect(fountain).toContain('Draft date: 25/05/2026');
    expect(fountain).toContain('Contact: Revision');
  });

  it('should have title page followed by double newline', () => {
    const titleEnd = fountain.indexOf('Contact:');
    const nextLine = fountain.indexOf('\n', titleEnd);
    // After the last title page field, there should be a blank line (\n\n)
    expect(fountain.substring(nextLine, nextLine + 2)).toBe('\n\n');
  });

  it('should output scene headings in proper format', () => {
    expect(fountain).toContain('INT. CASA DE IRINA - BAÑO - NOCHE');
    expect(fountain).toContain('EXT. PUEBLO - AMANECER');
    expect(fountain).toContain('INT. CASA DE IRINA - SALA - AMANECER');
    expect(fountain).toContain('EXT./INT. FOOD MART - ESTACIONAMIENTO - AMANECER');
  });

  it('should preserve scene numbers as Fountain #number# syntax', () => {
    expect(fountain).toContain('#1#');
    expect(fountain).toContain('#2#');
    expect(fountain).toContain('#5#');
  });

  it('scene heading should be followed by double newline', () => {
    const lines = fountain.split('\n');
    const sceneLineIdx = lines.findIndex(l => l.includes('INT. CASA DE IRINA - BAÑO - NOCHE'));
    expect(sceneLineIdx).toBeGreaterThan(-1);
    // Line after a scene heading should be blank
    expect(lines[sceneLineIdx + 1]).toBe('');
  });

  it('should output action text correctly', () => {
    expect(fountain).toContain('Oscuro. Irina (18) ya está vestida. Un foco. El espejo manchado.');
    expect(fountain).toContain('Irina se coloca una argolla en el septum. Dos segundos. De memoria, sin verse.');
  });

  it('should keep consecutive action paragraphs as separate blocks', () => {
    // "El monolítico edificio" and "de un" should be separate action lines
    expect(fountain).toContain('El monolítico edificio\n');
    expect(fountain).toContain('de un\n');
  });

  it('should output character cues and dialogue', () => {
    expect(fountain).toContain('IRINA\n');
    expect(fountain).toContain('Buenos días, Don Carlos.');
    expect(fountain).toContain('DON CARLOS\n');
    expect(fountain).toContain('(sin mirar)\n');
    expect(fountain).toContain('Llegas tarde.');
  });

  it('should have blank line before character cue', () => {
    const lines = fountain.split('\n');
    const irinaIdx = lines.findIndex(l => l.trim() === 'IRINA');
    expect(irinaIdx).toBeGreaterThan(0);
    // The line before should be blank
    expect(lines[irinaIdx - 1]).toBe('');
  });

  it('should output transition with Fountain > prefix', () => {
    expect(fountain).toContain('> CUT TO:\n');
  });

  it('should output DualDialogue with ^ marker', () => {
    expect(fountain).toContain('DON CARLOS ^\n');
    expect(fountain).toContain('No llegó. Nunca llega.');
  });

  it('should join multi-Text elements and preserve inline formatting', () => {
    // The last paragraph has three <Text> elements: plain, Bold "SALSA VALENTINA", plain ". Suspira."
    expect(fountain).toContain('Irina revisa una caja medio vacía de **SALSA VALENTINA**. Suspira.');
  });

  it('should not contain XML tags or parse errors', () => {
    expect(fountain).not.toContain('<Paragraph');
    expect(fountain).not.toContain('<Text');
    expect(fountain).not.toContain('parsererror');
  });

  it('should preserve inline formatting from FDX Style attributes', () => {
    // Test with a synthetic FDX containing styled text
    const styledFdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
<Content>
  <Paragraph Type="Action">
    <Text>The door </Text>
    <Text Style="Bold">slams</Text>
    <Text> shut.</Text>
  </Paragraph>
  <Paragraph Type="Action">
    <Text Style="Italic">She whispers.</Text>
  </Paragraph>
  <Paragraph Type="Action">
    <Text Style="Bold+Italic">BANG!</Text>
    <Text> Then </Text>
    <Text Style="Underline">silence</Text>
    <Text>.</Text>
  </Paragraph>
</Content>
</FinalDraft>`;
    const result = fdxToFountain(styledFdx);
    expect(result).toContain('The door **slams** shut.');
    expect(result).toContain('*She whispers.*');
    expect(result).toContain('***BANG!***');
    expect(result).toContain('_silence_');
  });

  it('should NOT add bold markers to Scene Headings, Characters, or Transitions (inherent CSS)', () => {
    const boldFdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
<Content>
  <Paragraph Type="Scene Heading"><Text Style="Bold">INT. OFFICE - DAY</Text></Paragraph>
  <Paragraph Type="Action"><Text>A normal action line.</Text></Paragraph>
  <Paragraph Type="Character"><Text Style="Bold">JOHN</Text></Paragraph>
  <Paragraph Type="Dialogue"><Text>Hello there.</Text></Paragraph>
  <Paragraph Type="Transition"><Text Style="Bold">CUT TO:</Text></Paragraph>
  <Paragraph Type="Action"><Text Style="Bold">Bold action text.</Text></Paragraph>
</Content>
</FinalDraft>`;
    const result = fdxToFountain(boldFdx);
    // Scene heading: bold is inherent → no ** markers
    expect(result).toContain('INT. OFFICE - DAY');
    expect(result).not.toContain('**INT. OFFICE - DAY**');
    // Character: bold is inherent → no ** markers
    expect(result).toContain('JOHN');
    expect(result).not.toContain('**JOHN**');
    // Transition: bold is inherent → no ** markers, uses > prefix
    expect(result).toContain('> CUT TO:');
    expect(result).not.toContain('**CUT TO:**');
    // Action: bold is NOT inherent → should get ** markers
    expect(result).toContain('**Bold action text.**');
  });

  it('should extract embedded title page when no TitlePage tag exists', () => {
    // This simulates the actual Matadero FDX structure from Final Draft
    const embeddedFdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="2">
<Content>
  <Paragraph Type="General" Alignment="Center"><Text></Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text></Text></Paragraph>
  <Paragraph Type="Title" Alignment="Center"><Text Style="">Matadero</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text></Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">Escrito por</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">Mariano Borgognone</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">Isabela Gonzalez Pazo</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">5ta Version</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">25/05/2026</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">Revision</Text></Paragraph>
  <Paragraph Type="General" Alignment="Center"><Text Style="">Billy Rovzar</Text></Paragraph>
  <Paragraph Type="Scene Heading" Number="1"><Text Style="AllCaps+Bold">INT. CASA DE Irina - BAÑO - NOCHE</Text></Paragraph>
  <Paragraph Type="Action"><Text>Oscuro. Irina (18) ya está vestida.</Text></Paragraph>
  <Paragraph Type="Character"><Text>IRINA</Text></Paragraph>
  <Paragraph Type="Dialogue"><Text>Hola mundo.</Text></Paragraph>
</Content>
</FinalDraft>`;
    const result = fdxToFountain(embeddedFdx);
    // Title page metadata should be extracted
    expect(result).toContain('Title: Matadero');
    expect(result).toContain('Credit: Escrito por');
    expect(result).toContain('Author: Mariano Borgognone');
    expect(result).toContain('Isabela Gonzalez Pazo');
    expect(result).toContain('Draft date: 25/05/2026');
    expect(result).toContain('Contact: Revision: Billy Rovzar');
    // Title page text should NOT appear as action/body content
    expect(result).not.toMatch(/\nMatadero\n/);
    expect(result).not.toMatch(/\nEscrito por\n/);
    expect(result).not.toMatch(/\nBilly Rovzar\n[^]/);  // not as body text
    // Script body should still work
    expect(result).toContain('INT. CASA DE Irina - BAÑO - NOCHE');
    expect(result).toContain('Oscuro. Irina (18) ya está vestida.');
    expect(result).toContain('IRINA\n');
    expect(result).toContain('Hola mundo.');
  });

  it('should extract scene number from Paragraph Number attribute', () => {
    const numFdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="2">
<Content>
  <Paragraph Type="Scene Heading" Number="42"><Text>INT. OFFICE - DAY</Text></Paragraph>
  <Paragraph Type="Action"><Text>An action line.</Text></Paragraph>
</Content>
</FinalDraft>`;
    const result = fdxToFountain(numFdx);
    expect(result).toContain('INT. OFFICE - DAY #42#');
  });
});
