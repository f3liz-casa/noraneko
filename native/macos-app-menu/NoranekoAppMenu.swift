import AppKit
import ObjectiveC

// Gecko's eCommand_ID_* values (widget/cocoa/nsMenuGroupOwnerX.h). Services has
// tag 0 and is recognised by its submenu instead.
private let nativeTags: [String: Int] = [
    "about": 1, "settings": 2, "quit": 3, "hideApp": 4, "hideOthers": 5,
    "showAll": 6, "update": 7, "touchBar": 8, "account": 9,
    "setAsDefault": 10, "referrals": 11,
]
private let referralsTag = 11
private let customMarker = "org.noraneko.appmenu.custom"

private var mirrorKey = 0

private enum Entry {
    case native(String, symbol: String?)
    case mirror(from: Int, count: Int?)
    case separator
    case custom(
        id: Int, title: String, enabled: Bool, key: String,
        modifiers: NSEvent.ModifierFlags, symbol: String?)
}

private func parseModifiers(_ names: [String]?) -> NSEvent.ModifierFlags {
    guard let names = names else { return [.command] }
    var flags: NSEvent.ModifierFlags = []
    for name in names {
        switch name {
        case "cmd": flags.insert(.command)
        case "shift": flags.insert(.shift)
        case "opt": flags.insert(.option)
        case "ctrl": flags.insert(.control)
        default: break
        }
    }
    return flags
}

private func parseLayout(_ json: String) -> [Entry]? {
    guard let data = json.data(using: .utf8),
        let raw = try? JSONSerialization.jsonObject(with: data),
        let array = raw as? [[String: Any]]
    else { return nil }

    var entries: [Entry] = []
    for dict in array {
        switch dict["type"] as? String {
        case "native":
            guard let key = dict["key"] as? String,
                key == "services" || nativeTags[key] != nil
            else { return nil }
            entries.append(.native(key, symbol: dict["symbol"] as? String))
        case "separator":
            entries.append(.separator)
        case "mirror":
            entries.append(
                .mirror(from: dict["from"] as? Int ?? 0, count: dict["count"] as? Int))
        case "custom":
            guard let id = dict["id"] as? Int, id > 0,
                let title = dict["title"] as? String
            else { return nil }
            entries.append(
                .custom(
                    id: id, title: title,
                    enabled: dict["enabled"] as? Bool ?? true,
                    key: dict["key"] as? String ?? "",
                    modifiers: parseModifiers(dict["modifiers"] as? [String]),
                    symbol: dict["symbol"] as? String))
        default:
            return nil
        }
    }
    return entries
}

@objc(NoranekoAppMenuTarget)
final class Target: NSObject {
    // With autoenablesItems the menu ignores isEnabled unless the target
    // validates the item, so the state lives here.
    @objc func validateMenuItem(_ item: NSMenuItem) -> Bool {
        return State.enabled[item.tag] ?? true
    }

    // Records which custom item was hit, then forwards through Gecko's own
    // Share item so the click reaches the DOM `command` listener without any
    // native-to-JS callback. JS reads the id with noraneko_take_clicked().
    @objc func fire(_ sender: NSMenuItem) {
        State.pendingClick = sender.tag
        guard let anchor = State.natives[referralsTag],
            let action = anchor.action
        else { return }
        NSApp.sendAction(action, to: anchor.target, from: anchor)
    }
}

private enum State {
    static var layout: [Entry] = []
    static var sourceTitle: String?
    static var enabled: [Int: Bool] = [:]
    static var pendingClick = 0
    static let target = Target()

    // Gecko keeps unretained pointers to its Set as Default and Share items
    // (ApplicationMenuDelegate) and touches them on every menu open, so every
    // native item we have seen stays retained here even when not displayed.
    static var natives: [Int: NSMenuItem] = [:]
    static var servicesItem: NSMenuItem?

    static var installed = false
    static var method: Method?
    static var originalIMP: IMP?
}

private func isOurs(_ item: NSMenuItem) -> Bool {
    return (item.representedObject as? String) == customMarker
}

private func isMirror(_ item: NSMenuItem) -> Bool {
    return objc_getAssociatedObject(item, &mirrorKey) != nil
}

// Items of the user-visible XUL menu, taken from whichever menu bar is the
// main menu right now (the front window's), so a copy always carries that
// window's command ids and is used right after, before any rebuild.
private func mirroredItems(from: Int, count: Int?) -> [NSMenuItem] {
    guard let title = State.sourceTitle, let main = NSApp.mainMenu else { return [] }
    guard
        let source = main.items.dropFirst().first(where: { $0.title == title })?
            .submenu
    else { return [] }

    let sources = source.items
    let end = count.map { min(sources.count, from + $0) } ?? sources.count
    guard from >= 0, from < end else { return [] }

    var copies: [NSMenuItem] = []
    for item in sources[from..<end] {
        if item.isSeparatorItem {
            copies.append(NSMenuItem.separator())
            continue
        }
        if item.isHidden || item.submenu != nil { continue }
        guard let copy = item.copy() as? NSMenuItem else { continue }
        // Key equivalents stay with the original, or they would fire twice.
        copy.keyEquivalent = ""
        copy.keyEquivalentModifierMask = []
        objc_setAssociatedObject(copy, &mirrorKey, true, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        copies.append(copy)
    }
    return copies
}

// このメニューでは、NSMenuItem.image が描かれない(画像は付いていて有効でも)。そこで、タイトルの
// 頭に、SF Symbol を文字として埋め込む。色は描く時点の labelColor で塗るので、ダーク/ライトに追従する。
@available(macOS 11.0, *)
private func decorate(_ item: NSMenuItem, symbol: String?) {
    guard let symbol = symbol,
        let base = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
    else {
        item.attributedTitle = nil
        return
    }
    let size = NSSize(width: 15, height: 15)
    let icon = NSImage(size: size, flipped: false) { rect in
        base.draw(in: rect)
        NSColor.labelColor.set()
        rect.fill(using: .sourceAtop)
        return true
    }
    let attachment = NSTextAttachment()
    attachment.image = icon
    attachment.bounds = NSRect(x: 0, y: -3, width: size.width, height: size.height)
    let text = NSMutableAttributedString(attachment: attachment)
    text.append(NSAttributedString(string: "  " + item.title))
    item.image = nil
    item.attributedTitle = text
}

private func applyLayout(to menu: NSMenu) {
    guard !State.layout.isEmpty else { return }

    var customs: [Int: NSMenuItem] = [:]
    var extras: [NSMenuItem] = []
    let known = Set(nativeTags.values)

    for item in menu.items {
        if item.isSeparatorItem || isMirror(item) { continue }
        if isOurs(item) {
            customs[item.tag] = item
        } else if item.submenu != nil {
            State.servicesItem = item
        } else if known.contains(item.tag) {
            State.natives[item.tag] = item
        } else {
            extras.append(item)
        }
    }

    var layout = State.layout
    let hasQuit = layout.contains {
        if case .native("quit", _) = $0 { return true }
        return false
    }
    if !hasQuit {
        layout.append(.separator)
        layout.append(.native("quit", symbol: nil))
    }

    var ordered: [NSMenuItem] = []
    func lastIsSeparator() -> Bool {
        return ordered.last?.isSeparatorItem ?? true
    }
    func add(_ item: NSMenuItem) {
        if item.isHidden { return }
        ordered.append(item)
    }

    for entry in layout {
        switch entry {
        case .separator:
            if !lastIsSeparator() { ordered.append(NSMenuItem.separator()) }
        case .mirror(let from, let count):
            for copy in mirroredItems(from: from, count: count) {
                if copy.isSeparatorItem && lastIsSeparator() { continue }
                add(copy)
            }
        case .native(let key, let symbol):
            if key == "quit", !extras.isEmpty {
                for extra in extras { add(extra) }
                extras.removeAll()
            }
            let item =
                key == "services" ? State.servicesItem : State.natives[nativeTags[key] ?? -1]
            if let item = item {
                if #available(macOS 11.0, *) { decorate(item, symbol: symbol) }
                add(item)
            }
        case .custom(let id, let title, let enabled, let key, let modifiers, let symbol):
            let item = customs[id] ?? NSMenuItem()
            item.title = title
            item.tag = id
            item.target = State.target
            item.action = #selector(Target.fire(_:))
            item.representedObject = customMarker
            item.keyEquivalent = key
            item.keyEquivalentModifierMask = modifiers
            if #available(macOS 11.0, *) { decorate(item, symbol: symbol) }
            State.enabled[id] = enabled
            item.isEnabled = enabled
            customs[id] = item
            add(item)
        }
    }
    while ordered.last?.isSeparatorItem ?? false { ordered.removeLast() }

    // Mirrored items keep Gecko's enabled state only if the menu does not
    // re-validate them against their target.
    menu.autoenablesItems = false
    menu.removeAllItems()
    for item in ordered where item.menu == nil {
        menu.addItem(item)
    }
}

private func appMenu() -> NSMenu? {
    guard let main = NSApp.mainMenu, main.numberOfItems > 0 else { return nil }
    return main.item(at: 0)?.submenu
}

private func stripDigits(_ s: String) -> String {
    return String(s.filter { !$0.isNumber })
}

/// 0 = installed, 1 = already installed, -1 = class missing, -2 = method
/// missing, -3 = unexpected signature.
@_cdecl("noraneko_install")
public func noraneko_install() -> Int32 {
    if State.installed { return 1 }
    guard let cls = NSClassFromString("ApplicationMenuDelegate") else { return -1 }
    let sel = NSSelectorFromString("menuWillOpen:")
    guard let method = class_getInstanceMethod(cls, sel) else { return -2 }
    guard let enc = method_getTypeEncoding(method),
        stripDigits(String(cString: enc)) == "v@:@"
    else { return -3 }

    let original = method_getImplementation(method)
    typealias Original = @convention(c) (AnyObject, Selector, NSMenu) -> Void
    let callOriginal = unsafeBitCast(original, to: Original.self)

    let hook: @convention(block) (AnyObject, NSMenu) -> Void = { object, menu in
        callOriginal(object, sel, menu)
        applyLayout(to: menu)
    }
    method_setImplementation(method, imp_implementationWithBlock(hook))

    State.method = method
    State.originalIMP = original
    State.installed = true
    return 0
}

@_cdecl("noraneko_uninstall")
public func noraneko_uninstall() -> Int32 {
    guard State.installed, let method = State.method, let original = State.originalIMP
    else { return 1 }
    method_setImplementation(method, original)
    State.installed = false
    State.layout = []
    return 0
}

/// Takes a UTF-8 JSON array. Returns 0 on success, -1 on a parse error (the
/// previous layout stays in effect).
@_cdecl("noraneko_set_layout")
public func noraneko_set_layout(_ json: UnsafePointer<CChar>?) -> Int32 {
    guard let json = json, let layout = parseLayout(String(cString: json)) else {
        return -1
    }
    State.layout = layout
    return 0
}

/// Title of the top-level menu whose items "mirror" entries copy. It must be a
/// visible menu in the menu bar.
@_cdecl("noraneko_set_source")
public func noraneko_set_source(_ title: UnsafePointer<CChar>?) -> Int32 {
    guard let title = title else { return -1 }
    State.sourceTitle = String(cString: title)
    return 0
}

/// Applies the current layout to the open-or-closed application menu now.
@_cdecl("noraneko_apply")
public func noraneko_apply() -> Int32 {
    guard let menu = appMenu() else { return -1 }
    applyLayout(to: menu)
    return 0
}

/// Returns the id of the custom item that was clicked since the last call,
/// or 0 if none.
@_cdecl("noraneko_take_clicked")
public func noraneko_take_clicked() -> Int32 {
    let id = State.pendingClick
    State.pendingClick = 0
    return Int32(id)
}

@_cdecl("noraneko_version")
public func noraneko_version() -> Int32 { return 1 }
