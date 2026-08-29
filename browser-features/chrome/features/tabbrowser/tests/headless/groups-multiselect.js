return (async () => {
  const gb = window.gBrowser;
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const sys = Services.scriptSecurityManager.getSystemPrincipal();
  const order = () => gb.tabs.map(t => t.label);
  const events = [];
  for (const n of ["TabMultiSelect", "TabGroupCreateByUser", "TabGrouped", "TabUngrouped", "TabGroupRemoveRequested", "TabGroupMoved"]) gb.tabContainer.addEventListener(n, e => events.push(n));

  const a = gb.addTab("data:text/html,<title>A</title>", { triggeringPrincipal: sys });
  const b = gb.addTab("data:text/html,<title>B</title>", { triggeringPrincipal: sys });
  const c = gb.addTab("data:text/html,<title>C</title>", { triggeringPrincipal: sys });
  await sleep(600);
  out.start = order();

  // ---- multi-select
  gb.addRangeToMultiSelectedTabs(a, c);
  await sleep(50);
  out.range = { selected: gb.selectedTabs.map(t => t.label), count: gb.multiSelectedTabsCount, attrs: gb.tabs.map(t => t.hasAttribute("multiselected")), all: gb.allTabsSelected(), last: gb.lastMultiSelectedTab?.label };
  gb.removeFromMultiSelectedTabs(b);
  await sleep(50);
  out.minusB = { selected: gb.selectedTabs.map(t => t.label), count: gb.multiSelectedTabsCount };
  gb.clearMultiSelectedTabs();
  await sleep(50);
  out.cleared = { count: gb.multiSelectedTabsCount, attrs: gb.tabs.map(t => t.hasAttribute("multiselected")), selectedTabs: gb.selectedTabs.map(t => t.label) };
  gb.selectAllTabs();
  await sleep(50);
  out.all = { count: gb.multiSelectedTabsCount, allSelected: gb.allTabsSelected() };
  gb.clearMultiSelectedTabs();
  await sleep(50);

  // ---- group
  const group = gb.addTabGroup([a, b], { label: "grp", color: "blue", isUserTriggered: true });
  await sleep(200);
  out.group = { isGroup: gb.isTabGroup(group), id: group?.id, label: group?.label, tabs: group?.tabs.map(t => t.label), aGroup: a.group === group, inStrip: group?.parentNode === gb.tabContainer, tabGroups: gb.tabGroups.length, byId: gb.getTabGroupById(group?.id) === group, order: order() };
  gb.moveTabToGroup(c, group);
  await sleep(100);
  out.moveCIn = { tabs: group.tabs.map(t => t.label), cGroup: c.group === group };
  gb.ungroupTab(c);
  await sleep(100);
  out.ungroupC = { tabs: group.tabs.map(t => t.label), cGroup: c.group, order: order() };
  gb.moveTabTo(group, { tabIndex: 3 });
  await sleep(100);
  out.moveGroup = { order: order(), groupIndex: [...gb.tabContainer.children].indexOf(group) };
  // collapsed groups' tabs are still "tabs"
  group.collapsed = true;
  await sleep(100);
  out.collapsed = { visible: gb.visibleTabs.map(t => t.label), inCollapsed: gb.tabsInCollapsedTabGroups.map(t => t.label), tabs: gb.tabs.length };
  group.collapsed = false;

  // successor / blur
  gb.setSuccessor(c, a);
  out.successor = { cSucc: c.successor === a, aPred: a.predecessors?.has(c) };
  gb.selectedTab = c;
  await sleep(200);
  gb.removeTab(c);
  await sleep(300);
  out.blurToSuccessor = { selected: gb.selectedTab.label };

  // remove the group (its tabs close, TabGroupRemoveRequested fires)
  await gb.removeTabGroup(group, { skipPermitUnload: true });
  await sleep(400);
  out.afterRemoveGroup = { order: order(), groups: gb.tabGroups.length, groupConnected: group.isConnected };

  out.events = [...new Set(events)];
  out.cleanup = { tabs: gb.tabs.length, anim: gb.tabAnimationsInProgress, listeners: gb._tabListeners.size, msCount: gb.multiSelectedTabsCount };
  return JSON.stringify(out, null, 1);
})();
