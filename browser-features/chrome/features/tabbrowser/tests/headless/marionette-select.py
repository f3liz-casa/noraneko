import socket, json, sys, time, os, base64
def rd(s):
    buf = b""
    while b":" not in buf: buf += s.recv(1)
    n, rest = buf.split(b":", 1); n = int(n); data = rest
    while len(data) < n: data += s.recv(n - len(data))
    return json.loads(data)
def send(s, i, cmd, params):
    msg = json.dumps([0, i, cmd, params]).encode()
    s.sendall(str(len(msg)).encode() + b":" + msg)
    while True:
        r = rd(s)
        if r[0] == 1 and r[1] == i:
            if r[2]: raise SystemExit(f"{cmd}: {r[2]}")
            return r[3]
port = int(os.environ.get("MPORT", "2829"))
for _ in range(120):
    try: s = socket.create_connection(("127.0.0.1", port), timeout=5); break
    except OSError: time.sleep(1)
else: raise SystemExit("marionette not listening")
s.settimeout(120); rd(s)
send(s, 1, "WebDriver:NewSession", {"capabilities": {}})
send(s, 2, "Marionette:SetContext", {"value": "chrome"})
script = r"""
const g = window.gBrowser; const out = {};
const sys = Services.scriptSecurityManager.getSystemPrincipal();
const tc = g.tabContainer, tp = g.tabpanels;
let selectCount = 0; const onSel = () => selectCount++;
tc.addEventListener("TabSelect", onSel);
out.cls = g.constructor.name;
out.start = { tabs: g.tabs.length, domTabs: tc.allTabs.length, rawTabs: tc.querySelectorAll("tab").length, sel: g.selectedTab === tc.selectedItem,
  selectedTabs: g.selectedTabs.length, panel0: tc.selectedItem?.linkedPanel, deck: tp.selectedPanel?.id,
  panels: Array.from(tp.children).map(p => p.id), linked: tc.allTabs.map(t => t.linkedPanel) };
const step = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name] = "ERR " + e + "\n" + e.stack; } };
let t;
step("add", () => { t = g.addTab("about:blank", { triggeringPrincipal: sys, inBackground: false });
  return { isSelected: g.selectedTab === t, domSelected: tc.selectedItem === t, attrSelected: t.hasAttribute("selected"),
    linkedPanel: t.linkedPanel, deck: tp.selectedPanel?.id, browserMatch: g.selectedBrowser === t.linkedBrowser,
    selectedTabs: g.selectedTabs.length, tabSelectEvents: selectCount, urlbar: gURLBar.value }; });
step("back", () => { g.selectedTab = g.tabs[0];
  return { sel0: g.selectedTab === g.tabs[0], deck: tp.selectedPanel?.id, expect: g.tabs[0].linkedPanel,
    browserMatch: g.selectedBrowser === g.tabs[0].linkedBrowser, tabSelectEvents: selectCount }; });
step("ui", () => { tc.selectedIndex = tc.allTabs.indexOf(t);
  return { sel1: g.selectedTab === t, deck: tp.selectedPanel?.id === t.linkedPanel, tabSelectEvents: selectCount }; });
step("icon", () => { g.setIcon(t, "chrome://branding/content/icon32.png");
  return { image: t.getAttribute("image"), mIconURL: t.linkedBrowser.mIconURL }; });
step("remove", () => { const before = tp.children.length; g.removeTab(t);
  return { tabs: g.tabs.length, domTabs: tc.allTabs.length, sel0: g.selectedTab === g.tabs[0], domSel0: tc.selectedItem === g.tabs[0],
    deck: tp.selectedPanel?.id === g.tabs[0].linkedPanel, panels: [before, tp.children.length], selectedTabs: g.selectedTabs.length,
    tConnected: t.isConnected, tabSelectEvents: selectCount }; });
step("final", () => { const t2 = g.addTab("about:blank", { triggeringPrincipal: sys, inBackground: false }); tc.removeEventListener("TabSelect", onSel);
  g.setIcon(t2, "chrome://branding/content/icon32.png");
  document.documentElement.style.setProperty("--toolbox-textcolor", "black");
  return { tabs: g.tabs.length, domTabs: tc.allTabs.length, selectedIsSecond: g.selectedTab === t2, image: t2.getAttribute("image") }; });
return out;
"""
print(json.dumps(send(s, 3, "WebDriver:ExecuteScript", {"script": script, "args": []})["value"], indent=1))
time.sleep(1.5)
r = send(s, 4, "WebDriver:TakeScreenshot", {"full": True})
open("/tmp/noraneko-select.png", "wb").write(base64.b64decode(r["value"]))
send(s, 5, "WebDriver:DeleteSession", {})
