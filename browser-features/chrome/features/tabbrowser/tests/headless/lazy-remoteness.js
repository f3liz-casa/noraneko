return (async () => {
  const gb = window.gBrowser;
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const wait = (pred, max = 60) => new Promise(r => { let n = 0; const t = setInterval(() => { n++; if (pred() || n > max) { clearInterval(t); r(n <= max); } }, 100); });
  const sys = Services.scriptSecurityManager.getSystemPrincipal();

  // ---- lazy tab
  const lazy = gb.addTab("data:text/html,<title>lazy page</title>lazy", { createLazyBrowser: true, lazyTabTitle: "Lazy title", triggeringPrincipal: sys });
  const lb = lazy.linkedBrowser;
  out.lazy = {
    linkedPanelBefore: lazy.linkedPanel ?? null,
    isLazyProps: "currentURI" in lb && Object.getOwnPropertyDescriptor(lb, "currentURI")?.get !== undefined,
    currentURI: lb.currentURI?.spec,
    label: lazy.label,
    pending: lazy.hasAttribute("pending"),
    listenerBefore: gb._tabListeners.has(lazy),
    panelsInDeck: gb.tabpanels.childElementCount,
    tabAnimationsInProgress: gb.tabAnimationsInProgress,
  };
  // selecting it must insert the browser (tabs.js getRelatedElement → _insertBrowser)
  gb.selectedTab = lazy;
  await wait(() => !!lazy.linkedPanel, 30);
  await sleep(800);
  out.lazyAfterSelect = {
    linkedPanel: lazy.linkedPanel ?? null,
    ownProps: Object.getOwnPropertyNames(lb).filter(n => gb._browserBindingProperties.includes(n)).length,
    listener: gb._tabListeners.get(lazy)?.mTabBrowser === gb,
    currentURI: lb.currentURI?.spec,
    selected: gb.selectedTab === lazy,
    tabAnimationsInProgress: gb.tabAnimationsInProgress,
  };

  // ---- remoteness: a web-process tab asked to show a parent-process page
  const web = gb.addTab("data:text/html,web", { inBackground: false, triggeringPrincipal: sys });
  await wait(() => web.linkedBrowser.currentURI?.spec?.startsWith("data:"), 30);
  const rt0 = web.linkedBrowser.remoteType;
  let remoteEvents = [];
  web.addEventListener("BeforeTabRemotenessChange", () => remoteEvents.push("before"));
  web.addEventListener("TabRemotenessChange", () => remoteEvents.push("after"));
  let switched = null;
  try {
    switched = gb.updateBrowserRemoteness(web.linkedBrowser, { remoteType: E10SUtils.NOT_REMOTE });
  } catch (e) { switched = "threw: " + e.message; }
  await sleep(300);
  out.remoteness = { before: rt0, switched, after: web.linkedBrowser.remoteType, events: remoteEvents, listener: gb._tabListeners.get(web)?.mTabBrowser === gb };
  // now load about:robots into it (parent-process page) and see it render
  web.linkedBrowser.loadURI(Services.io.newURI("about:robots"), { triggeringPrincipal: sys });
  await wait(() => web.linkedBrowser.currentURI?.spec === "about:robots" && !web.linkedBrowser.webProgress.isLoadingDocument, 40);
  out.robots = { uri: web.linkedBrowser.currentURI?.spec, label: web.label, remoteType: web.linkedBrowser.remoteType, docTitle: document.title };

  // ---- and the by-URL helper picking a web process again
  const back = gb.updateBrowserRemotenessByURL(web.linkedBrowser, "https://example.com/");
  await sleep(200);
  out.byURL = { switched: back, remoteType: web.linkedBrowser.remoteType };

  gb.removeTab(lazy); gb.removeTab(web);
  await sleep(300);
  out.cleanup = { tabs: gb.tabs.length, listeners: gb._tabListeners.size, filters: gb._tabFilters.size, tabAnimationsInProgress: gb.tabAnimationsInProgress };
  return JSON.stringify(out, null, 1);
})();
