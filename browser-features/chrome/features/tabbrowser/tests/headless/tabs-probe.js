return JSON.stringify(window.gBrowser.tabs.map(t => ({ uri: t.linkedBrowser?.currentURI?.spec, label: t.label, selected: t.selected, pending: t.hasAttribute("pending"), panel: t.linkedPanel })));
