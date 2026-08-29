return (async () => {
  const gb = window.gBrowser;
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sys = Services.scriptSecurityManager.getSystemPrincipal();
  const order = () => gb.tabs.map(t => t.label);
  const tPos = () => gb.tabs.map(t => t._tPos);
  const events = [];
  for (const n of ["TabMove", "TabPinned", "TabUnpinned", "TabHide", "TabShow", "TabOpen"]) gb.tabContainer.addEventListener(n, e => events.push(n + ":" + e.target.label));

  // three tabs: home, A, B (A,B in background → stay after home)
  const a = gb.addTab("data:text/html,<title>A</title>", { triggeringPrincipal: sys });
  const b = gb.addTab("data:text/html,<title>B</title>", { triggeringPrincipal: sys });
  await sleep(600);
  out.start = { order: order(), tPos: tPos(), aOwner: a.owner?.label ?? null, initializing: "initializingTab" in a };

  // insertAfterCurrent-style: explicit tabIndex 1 → between home and A
  const c = gb.addTab("data:text/html,<title>C</title>", { triggeringPrincipal: sys, tabIndex: 1 });
  await sleep(300);
  out.insertAt1 = { order: order(), tPos: tPos() };

  // moves
  gb.moveTabTo(c, { tabIndex: 3 });
  out.moveTo3 = order();
  gb.moveTabBefore(c, a);
  out.beforeA = order();
  gb.moveTabAfter(c, b);
  out.afterB = order();
  gb.moveTabToStart(c);
  out.toStart = order();
  gb.moveTabToEnd(c);
  out.toEnd = order();

  // pin / unpin
  gb.pinTab(b);
  out.pinB = { order: order(), pinned: gb.tabs.map(t => t.pinned), pinnedTabCount: gb.pinnedTabCount, inPinnedContainer: b.parentNode === gb.pinnedTabsContainer, isAppTab: b.linkedBrowser.browsingContext?.isAppTab };
  gb.moveTabToEnd(b); // pinned tab: must stay in the pinned region
  out.pinnedMoveClamped = order();
  gb.unpinTab(b);
  out.unpinB = { order: order(), pinnedTabCount: gb.pinnedTabCount, parentIsArrowScrollbox: b.parentNode === gb.tabContainer.arrowScrollbox };

  // hide / show
  gb.hideTab(c, "test");
  out.hideC = { hidden: c.hidden, visible: gb.visibleTabs.map(t => t.label), hiddenBy: SessionStore.getCustomTabValue(c, "hiddenBy") };
  gb.showTab(c);
  out.showC = { hidden: c.hidden, visible: gb.visibleTabs.map(t => t.label) };

  // keyboard-style moves of the selected tab
  gb.selectedTab = a;
  await sleep(200);
  gb.moveTabForward();
  out.fwd = order();
  gb.moveTabBackward();
  out.back = order();

  // duplicate via SessionStore
  const d = gb.duplicateTab(a, true);
  await sleep(800);
  out.dup = { label: d?.label, after: order(), isTab: gb.isTab(d), listener: gb._tabListeners.get(d)?.mTabBrowser === gb };

  // browsers proxy + lookups
  out.proxy = { len: gb.browsers.length, b0: gb.browsers[0] === gb.tabs[0].linkedBrowser, atIdx: gb.getBrowserAtIndex(1) === gb.tabs[1].linkedBrowser, forTab: gb.getBrowserForTab(a) === a.linkedBrowser };

  out.events = events;
  for (const t of [a, b, c, d]) if (t) gb.removeTab(t);
  await sleep(300);
  out.cleanup = { tabs: gb.tabs.length, anim: gb.tabAnimationsInProgress, listeners: gb._tabListeners.size };
  return JSON.stringify(out, null, 1);
})();
