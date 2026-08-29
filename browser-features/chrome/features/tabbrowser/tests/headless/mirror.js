return (async () => {
  const gb = window.gBrowser;
  const nt = window.noraneko.tabbrowser;
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sys = Services.scriptSecurityManager.getSystemPrincipal();
  const snap = () => { const s = nt.appState.value; return { order: s.tabOrder.map(id => s.tabs[id].label), selected: s.selectedTabId ? s.tabs[s.selectedTabId].label : null, pinned: s.tabOrder.map(id => s.tabs[id].isPinned), groups: Object.values(s.groups).map(g => ({ title: g.title, tabs: g.tabs.map(id => s.tabs[id].label) })) }; };
  out.initial = { ...snap(), uri: nt.appState.value.tabs[nt.appState.value.tabOrder[0]].uri, keys: Object.keys(nt.appState.value) };
  const a = gb.addTab("data:text/html,<title>A</title>", { triggeringPrincipal: sys });
  const b = gb.addTab("data:text/html,<title>B</title>", { triggeringPrincipal: sys, inBackground: false });
  await sleep(600);
  out.afterAdd = snap();
  out.idStable = nt.appState.value.tabOrder[1] === Object.keys(nt.appState.value.tabs).find(id => nt.appState.value.tabs[id].label === "A");
  out.tabById = nt.tabById(nt.appState.value.tabOrder[1]) === a;
  gb.moveTabToStart(b); await sleep(50);
  out.afterMove = snap().order;
  gb.pinTab(a); await sleep(50);
  out.afterPin = snap();
  const g = gb.addTabGroup([b], { label: "g", color: "red" }); await sleep(100);
  out.afterGroup = snap();
  out.busyMirrored = nt.appState.value.tabs[nt.appState.value.tabOrder[0]].isBusy === a.hasAttribute("busy");
  // the Preact strip drawn from the mirror
  // in the document: XULElement.click() is silent on a detached element
  const box = document.documentElement.appendChild(document.createXULElement("vbox"));
  nt.renderTabStrip(box);
  await sleep(100);
  const drawn = () => [...box.querySelectorAll(".tabbrowser-tab")].map(t => t.querySelector(".tab-label")?.getAttribute("value"));
  out.drawn = drawn();
  out.drawnSelected = [...box.querySelectorAll(".tabbrowser-tab")].map(t => t.getAttribute("selected") === "true");
  // click on a drawn tab (not the selected one) selects the real one
  box.querySelectorAll(".tabbrowser-tab")[1].click(); await sleep(300);
  out.clickSelects = { selected: gb.selectedTab.label, mirrorSelected: snap().selected };
  gb.removeTab(b); await sleep(300);
  out.afterRemove = { ...snap(), drawn: drawn() };
  out.afterRemove.drawnFollows = JSON.stringify(out.afterRemove.drawn) === JSON.stringify(out.afterRemove.order);
  gb.unpinTab(a); gb.removeTab(a); await sleep(300);
  box.remove();
  out.final = snap();
  return JSON.stringify(out, null, 1);
})();
