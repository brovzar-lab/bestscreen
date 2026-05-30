"use strict";

/* ───────────────────────────────────────────────────────────
   menubar.js – Bestscreen menu-bar controller
   Self-contained: generates HTML from MENUS[], manages
   dropdowns, keyboard nav, checked / disabled / submenu states.
   ─────────────────────────────────────────────────────────── */

(function () {

  /* ── Menu data ─────────────────────────────────────────── */

  const MENUS = [
    {
      label: "File",
      items: [
        { label: "New Project", run: () => Dashboard.show() },
        { label: "Open\u2026", shortcut: "\u2318O", run: () => openFromFile() },
        { sep: true },
        { label: "Save .fountain", shortcut: "\u2318S", run: () => $("#btn-save").click() },
        { label: "Export .fdx", run: () => exportFdx() },
        { sep: true },
        { label: "Title Page\u2026", run: () => openTitlePage() },
        { sep: true },
        { label: "Print / PDF", shortcut: "\u2318P", run: () => printPdf(false) },
        { label: "Watermarked PDF", run: () => printPdfWithWatermark() },
        { sep: true },
        { label: "Back to Projects", run: () => Dashboard.show() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "\u2318Z", run: () => document.execCommand("undo") },
        { label: "Redo", shortcut: "\u2318\u21E7Z", run: () => document.execCommand("redo") },
        { sep: true },
        { label: "Move Selection Up", shortcut: "\u2325\u2191", disabled: true },
        { label: "Move Selection Down", shortcut: "\u2325\u2193", disabled: true },
        { sep: true },
        { label: "Insert", arrow: true, disabled: true },
        { sep: true },
        { label: "Select All", shortcut: "\u2318A", run: () => document.execCommand("selectAll") },
        { sep: true },
        { label: "Find\u2026", shortcut: "\u2318F", run: () => $("#btn-find").click() },
        { label: "Go To\u2026", shortcut: "\u2318K", run: () => openCmdk() },
        { sep: true },
        { label: "Dictate", run: () => toggleDictation() },
      ],
    },
    {
      label: "Format",
      items: [
        { label: "Line Type", arrow: true, disabled: true },
        { label: "Dual Dialogue", disabled: true },
        { label: "Exit Dual", disabled: true },
        { sep: true },
        {
          label: "Smart Typography",
          run: () => { appState.smartTypo = !appState.smartTypo; setDirty(); },
          checked: () => appState.smartTypo,
        },
        {
          label: "Read-Only (Production Lock)",
          run: () => {
            appState.prodLocked = !appState.prodLocked;
            document.body.dataset.prodLocked = appState.prodLocked ? "true" : "";
            setDirty();
          },
          checked: () => appState.prodLocked,
        },
      ],
    },
    {
      label: "Share",
      items: [
        { label: "Share Link\u2026", run: () => $("#btn-share").click() },
        { label: "Sides Export\u2026", run: () => openSides() },
        { sep: true },
        { label: "Coverage Report", run: () => generateCoverage() },
        { label: "Email Document", disabled: true },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Page View", run: () => togglePageView(), checked: () => appState.pageView },
        { label: "Card View", run: () => setView("cards") },
        { label: "Beat Board", run: () => setView("beats") },
        { label: "Bible", run: () => setView("bible") },
        { label: "Timeline", run: () => setView("timeline") },
        { label: "Statistics", run: () => setView("stats") },
        { sep: true },
        {
          label: "Full Screen",
          run: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          },
        },
        { label: "Typewriter Mode", run: () => toggleTypewriter(), checked: () => appState.typewriter },
        { label: "Dark Mode", run: () => cycleTheme() },
        { sep: true },
        {
          label: "Page Breaks",
          run: () => {
            appState.showPageBreaks = !appState.showPageBreaks;
            document.body.dataset.pagebreaks = appState.showPageBreaks ? "true" : "";
            applyPageBreaks();
            setDirty();
          },
          checked: () => appState.showPageBreaks,
        },
        { sep: true },
        {
          label: "Show Sidebar",
          run: () => toggleSidebar(),
          checked: () => !document.getElementById("sidebar")?.classList.contains("collapsed"),
        },
        {
          label: "Show Inspector",
          run: () => toggleInspector(),
          checked: () => document.getElementById("inspector")?.classList.contains("open"),
        },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "AI Assist\u2026", run: () => $("#btn-ai").click() },
        { label: "Proofcheck", run: () => typeof Proof !== "undefined" && Proof.run() },
        { sep: true },
        { label: "Outliner", arrow: true, disabled: true },
        { label: "Graveyard (Scrap Bin)", run: () => openBin() },
        { label: "Comments", arrow: true, disabled: true },
        { label: "Spelling & Grammar", arrow: true, disabled: true },
        { sep: true },
        { label: "ReadAloud", shortcut: "\u2318\u21E7A", run: () => openAloud() },
        { sep: true },
        { label: "Writing Sprint", shortcut: "\u2318\u21E7F", run: () => $("#btn-sprint").click() },
        { label: "Ambient Sounds", run: () => $("#btn-sound").click() },
        { sep: true },
        { label: "Continuity Check", run: () => openContinuity() },
        { label: "Logline Workshop", run: () => openLoglineWorkshop() },
        { sep: true },
        { label: "Rename Character\u2026", disabled: true },
        { label: "Check Formatting", run: () => reclassifyAll() },
        { label: "Word Count", run: () => toast("Words: " + currentWordCount()) },
        { label: "Command Palette", shortcut: "\u2318K", run: () => openCmdk() },
      ],
    },
    {
      label: "Reports",
      items: [
        { label: "Document Statistics", run: () => setView("stats") },
        { label: "Coverage Report", run: () => generateCoverage() },
        { sep: true },
        { label: "Track Changes Log", run: () => openChangesViewer() },
        { label: "PDF History", run: () => openPdfLogViewer() },
        { sep: true },
        { label: "Dialogue Filter\u2026", disabled: true },
        { label: "Non-Dialogue Filter", disabled: true },
        { label: "Locations & Scenes", disabled: true },
        { label: "Character Scenes\u2026", disabled: true },
      ],
    },
    {
      label: "Revisions",
      items: [
        { label: "Save Snapshot", shortcut: "\u2318\u21E7S", run: () => openSnap() },
        { label: "Compare Snapshots", run: () => $("#modal-diff").classList.add("open") },
        { sep: true },
        { label: "Revision Color", disabled: true },
        { sep: true },
        { label: "Scrap Bin", shortcut: "\u2318\u21E7B", run: () => openBin() },
        { label: "Duplicate Document", disabled: true },
        { label: "Timeline View", run: () => setView("timeline") },
      ],
    },
    {
      label: "Production",
      items: [
        {
          label: "Scene Numbers",
          run: () => { appState.showSceneNumbersInPdf = !appState.showSceneNumbersInPdf; setDirty(); },
          checked: () => appState.showSceneNumbersInPdf,
        },
        {
          label: "Production Lock",
          run: () => {
            appState.prodLocked = !appState.prodLocked;
            document.body.dataset.prodLocked = appState.prodLocked ? "true" : "";
            setDirty();
          },
          checked: () => appState.prodLocked,
        },
        { sep: true },
        { label: "Watermarks", run: () => printPdfWithWatermark() },
        { label: "Mores & Continueds", disabled: true },
        { sep: true },
        { label: "Lock Pages\u2026", disabled: true },
        { label: "Lock Line Numbers\u2026", disabled: true },
        { label: "Headers & Footers\u2026", disabled: true },
      ],
    },
    {
      label: "Customize",
      items: [
        { label: "Settings\u2026", run: () => $("#modal-settings").classList.add("open") },
        { label: "Display Theme", run: () => cycleTheme() },
        { sep: true },
        {
          label: "Document Language",
          run: () => { const chip = $("#proof-lang"); if (chip) chip.click(); },
        },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Keyboard Shortcuts", run: () => $("#modal-help").classList.add("open") },
        { label: "Formatting Guide", run: () => $("#modal-help").classList.add("open") },
        { sep: true },
        { label: "Command Palette", shortcut: "\u2318K", run: () => openCmdk() },
      ],
    },
  ];

  /* ── State ─────────────────────────────────────────────── */

  let openMenuIdx = -1;       // which top-level menu is open (-1 = none)
  let focusedItemIdx = -1;    // which item inside the open dropdown has focus
  let menubarEl = null;       // cached #menubar element
  let triggers = [];          // all .menu-trigger buttons
  let menus = [];             // all .menu wrapper divs

  /* ── DOM helpers ───────────────────────────────────────── */

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") node.className = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else node.setAttribute(k, v);
      }
    }
    if (typeof children === "string") {
      node.textContent = children;
    } else if (Array.isArray(children)) {
      children.forEach(c => { if (c) node.appendChild(c); });
    }
    return node;
  }

  /* ── Build HTML ────────────────────────────────────────── */

  function buildMenuHTML() {
    const frag = document.createDocumentFragment();

    MENUS.forEach((menu, mIdx) => {
      const wrapper = el("div", { className: "menu" });

      // Trigger button
      const trigger = el("button", {
        className: "menu-trigger",
        dataset: { menu: String(mIdx) },
      }, menu.label);
      wrapper.appendChild(trigger);

      // Dropdown
      const dropdown = el("div", { className: "menu-dropdown" });
      menu.items.forEach((item, iIdx) => {
        if (item.sep) {
          dropdown.appendChild(el("div", { className: "menu-sep" }));
          return;
        }

        const btn = el("button", {
          className: "menu-item",
          dataset: { idx: String(iIdx) },
        });

        if (item.disabled) {
          btn.classList.add("disabled");
          btn.setAttribute("aria-disabled", "true");
        }

        // Label (check mark is prepended on open)
        const labelSpan = el("span", { className: "menu-label" });
        const checkSpan = el("span", { className: "menu-check" });
        labelSpan.appendChild(checkSpan);
        labelSpan.appendChild(document.createTextNode(item.label));
        btn.appendChild(labelSpan);

        // Submenu arrow
        if (item.arrow) {
          btn.appendChild(el("span", { className: "menu-arrow" }, "\u25B8"));
        }

        // Shortcut
        if (item.shortcut) {
          btn.appendChild(el("span", { className: "menu-shortcut" }, item.shortcut));
        }

        dropdown.appendChild(btn);
      });

      wrapper.appendChild(dropdown);
      frag.appendChild(wrapper);
    });

    return frag;
  }

  /* ── Open / close helpers ──────────────────────────────── */

  function closeAll() {
    menus.forEach(m => m.classList.remove("open"));
    triggers.forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-expanded", "false");
    });
    openMenuIdx = -1;
    focusedItemIdx = -1;
  }

  function openMenu(idx) {
    if (idx < 0 || idx >= MENUS.length) return;

    closeAll();
    openMenuIdx = idx;
    focusedItemIdx = -1;

    const wrapper = menus[idx];
    const trigger = triggers[idx];
    wrapper.classList.add("open");
    trigger.classList.add("active");
    trigger.setAttribute("aria-expanded", "true");

    // Recalculate checked states
    refreshChecks(idx);
  }

  function refreshChecks(idx) {
    const menuData = MENUS[idx];
    const dropdown = menus[idx].querySelector(".menu-dropdown");
    const buttons = dropdown.querySelectorAll(".menu-item");

    let dataIdx = 0;
    menuData.items.forEach(item => {
      if (item.sep) return;
      const btn = buttons[dataIdx++];
      if (!btn) return;
      const checkSpan = btn.querySelector(".menu-check");
      if (checkSpan) {
        if (typeof item.checked === "function") {
          checkSpan.textContent = item.checked() ? "\u2713 " : "    ";
        } else {
          checkSpan.textContent = "";
        }
      }
    });
  }

  /* ── Focusable items inside current dropdown ───────────── */

  function getActionableItems() {
    if (openMenuIdx < 0) return [];
    const dropdown = menus[openMenuIdx].querySelector(".menu-dropdown");
    // all .menu-item buttons (including disabled, for arrow navigation)
    return Array.from(dropdown.querySelectorAll(".menu-item"));
  }

  function focusItem(idx) {
    const items = getActionableItems();
    if (!items.length) return;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    focusedItemIdx = idx;
    items.forEach((it, i) => it.classList.toggle("focused", i === idx));
    items[idx].scrollIntoView({ block: "nearest" });
  }

  function activateItem(idx) {
    const items = getActionableItems();
    const btn = items[idx];
    if (!btn || btn.classList.contains("disabled")) return;

    const menuData = MENUS[openMenuIdx];
    // Map button index back to data index
    let dataIndex = -1;
    let btnCount = 0;
    for (let i = 0; i < menuData.items.length; i++) {
      if (menuData.items[i].sep) continue;
      if (btnCount === idx) { dataIndex = i; break; }
      btnCount++;
    }
    if (dataIndex < 0) return;

    const item = menuData.items[dataIndex];
    if (typeof item.run === "function") {
      closeAll();
      item.run();
    }
  }

  /* ── Event handlers ────────────────────────────────────── */

  function onTriggerClick(e) {
    const trigger = e.currentTarget;
    const idx = Number(trigger.dataset.menu);

    if (openMenuIdx === idx) {
      closeAll();
    } else {
      openMenu(idx);
    }
    e.stopPropagation();
  }

  function onTriggerMouseEnter(e) {
    if (openMenuIdx < 0) return; // no menu open, ignore hover
    const idx = Number(e.currentTarget.dataset.menu);
    if (idx !== openMenuIdx) {
      openMenu(idx);
    }
  }

  function onItemClick(e) {
    const btn = e.currentTarget;
    if (btn.classList.contains("disabled")) {
      e.stopPropagation();
      return;
    }

    // Find which item this is
    const items = getActionableItems();
    const idx = items.indexOf(btn);
    if (idx >= 0) {
      activateItem(idx);
    }
    e.stopPropagation();
  }

  function onDocumentClick(e) {
    // Click outside menubar closes everything
    if (menubarEl && !menubarEl.contains(e.target)) {
      closeAll();
    }
  }

  function onKeyDown(e) {
    // Only handle keys when a menu is open or a trigger is focused
    if (openMenuIdx < 0) {
      // If a trigger has focus we can open with Enter/Space/ArrowDown
      const active = document.activeElement;
      if (active && active.classList.contains("menu-trigger")) {
        const idx = Number(active.dataset.menu);
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          openMenu(idx);
          focusItem(0);
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          const next = (idx + 1) % triggers.length;
          triggers[next].focus();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = (idx - 1 + triggers.length) % triggers.length;
          triggers[prev].focus();
          return;
        }
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        const prevTrigger = triggers[openMenuIdx];
        closeAll();
        if (prevTrigger) prevTrigger.focus();
        break;

      case "ArrowDown":
        e.preventDefault();
        focusItem(focusedItemIdx + 1);
        break;

      case "ArrowUp":
        e.preventDefault();
        focusItem(focusedItemIdx - 1);
        break;

      case "ArrowRight":
        e.preventDefault();
        openMenu((openMenuIdx + 1) % MENUS.length);
        focusItem(0);
        break;

      case "ArrowLeft":
        e.preventDefault();
        openMenu((openMenuIdx - 1 + MENUS.length) % MENUS.length);
        focusItem(0);
        break;

      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedItemIdx >= 0) {
          activateItem(focusedItemIdx);
        }
        break;

      case "Home":
        e.preventDefault();
        focusItem(0);
        break;

      case "End":
        e.preventDefault();
        focusItem(getActionableItems().length - 1);
        break;

      default:
        break;
    }
  }

  /* ── Init ──────────────────────────────────────────────── */

  function initMenubar() {
    menubarEl = document.getElementById("menubar");
    if (!menubarEl) return;

    // Clear existing content
    menubarEl.innerHTML = "";
    menubarEl.setAttribute("role", "menubar");

    // Build and append
    menubarEl.appendChild(buildMenuHTML());

    // Cache references
    triggers = Array.from(menubarEl.querySelectorAll(".menu-trigger"));
    menus = Array.from(menubarEl.querySelectorAll(".menu"));

    // Attach trigger listeners
    triggers.forEach(t => {
      t.setAttribute("aria-haspopup", "true");
      t.setAttribute("aria-expanded", "false");
      t.addEventListener("click", onTriggerClick);
      t.addEventListener("mouseenter", onTriggerMouseEnter);
    });

    // Attach item click listeners (delegated per dropdown)
    menus.forEach(m => {
      const items = m.querySelectorAll(".menu-item");
      items.forEach(item => {
        item.addEventListener("click", onItemClick);

        // Mouse hover inside dropdown highlights item
        item.addEventListener("mouseenter", () => {
          const all = getActionableItems();
          const idx = all.indexOf(item);
          if (idx >= 0) {
            focusedItemIdx = idx;
            all.forEach((it, i) => it.classList.toggle("focused", i === idx));
          }
        });
        item.addEventListener("mouseleave", () => {
          item.classList.remove("focused");
        });
      });
    });

    // Global listeners
    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
  }

  /* ── Bootstrap ─────────────────────────────────────────── */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMenubar);
  } else {
    initMenubar();
  }

})();
