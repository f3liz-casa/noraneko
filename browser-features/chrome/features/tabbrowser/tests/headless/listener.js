return (async () => {
  const gb = window.gBrowser;
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const wait = (pred, max = 60) => new Promise(r => { let n = 0; const t = setInterval(() => { n++; if (pred() || n > max) { clearInterval(t); r(n <= max); } }, 100); });

  // takeover
  out.compatIsGBrowser = gb.constructor.name;
  out.globalListeners = gb.mProgressListeners.map(l => l === window.XULBrowserWindow ? "XULBrowserWindow" : (l.constructor?.name || typeof l));
  out.tabsListeners = gb.mTabsProgressListeners.length;
  out.tabListenersMine = [...gb._tabListeners.values()].every(l => l.mTabBrowser === gb);
  out.tabListenerCount = gb._tabListeners.size;
  out.tabs = gb.tabs.length;

  // open a tab: busy attribute should appear then go, title + urlbar follow
  const busySeen = { start: false, end: false };
  const t = gb.addTrustedTab("data:text/html,<title>P2 title</title><h1 style='font-size:60px'>listener works</h1>", { inBackground: false });
  const b = t.linkedBrowser;
  out.newTabListenerMine = gb._tabListeners.get(t)?.mTabBrowser === gb;
  out.newTabFilter = !!gb._tabFilters.get(t);
  out.hasSiblings = gb.tabs[0].linkedBrowser.browsingContext?.hasSiblings;
  await wait(() => { if (t.hasAttribute("busy")) busySeen.start = true; return busySeen.start; }, 30);
  await wait(() => !t.hasAttribute("busy") && b.currentURI?.spec?.startsWith("data:"), 60);
  busySeen.end = !t.hasAttribute("busy");
  out.busy = busySeen;
  out.label = t.label;
  out.docTitle = window.document.title;
  out.urlbar = window.gURLBar.value;
  out.tabBrowserInsertedFired = !!t.linkedPanel;
  out.loadURIWrapped = typeof b.loadURI === "function" && b.loadURI.name === "bound loadURI";

  // switch back to tab 0 and check urlbar follows via onLocationChange of the adopted tab's listener
  gb.selectedTab = gb.tabs[0];
  await sleep(500);
  out.urlbarAfterSwitchBack = window.gURLBar.value;
  gb.selectedTab = t;
  await sleep(500);
  out.urlbarAfterSwitchForward = window.gURLBar.value;

  // remove tab: listener cleaned
  gb.removeTab(t);
  await sleep(300);
  out.afterRemove = { tabs: gb.tabs.length, listeners: gb._tabListeners.size, filters: gb._tabFilters.size };
  window.document.documentElement.style.setProperty("--toolbox-textcolor", "black");
  return JSON.stringify(out, null, 1);
})();
