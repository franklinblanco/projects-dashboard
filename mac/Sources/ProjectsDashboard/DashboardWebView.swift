import SwiftUI
import WebKit
import AppKit
import CoreServices

/// SwiftUI wrapper around WKWebView. Installs `openTerminal` and `openClaude`
/// message handlers so the web app can ask the native app to open a terminal at
/// a project's path (and optionally launch Claude Code there).
struct DashboardWebView: NSViewRepresentable {
    let urlString: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "openTerminal")
        config.userContentController.add(context.coordinator, name: "openClaude")

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        // Persist cookies (the auth session) across launches.
        webView.configuration.websiteDataStore = .default()
        load(webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastURL != urlString {
            load(webView)
        }
    }

    private func load(_ webView: WKWebView) {
        guard let url = URL(string: urlString) else { return }
        (webView.navigationDelegate as? Coordinator)?.lastURL = urlString
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var lastURL: String = ""

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let path = message.body as? String, !path.isEmpty else { return }
            switch message.name {
            case "openTerminal": openInTerminal(at: path, runClaude: false)
            case "openClaude": openInTerminal(at: path, runClaude: true)
            default: break
            }
        }

        /// Opens a terminal at `path` (optionally launching `claude`). We write a
        /// temporary shell script and open it with the resolved terminal app.
        private func openInTerminal(at path: String, runClaude: Bool) {
            let expanded = (path as NSString).expandingTildeInPath
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir) else {
                NSLog("openInTerminal: path does not exist: \(expanded)")
                return
            }

            // Single-quote the path so it's safe inside the shell script.
            let quoted = "'" + expanded.replacingOccurrences(of: "'", with: "'\\''") + "'"
            var lines = ["#!/bin/zsh", "cd \(quoted) || exit 1"]
            if runClaude { lines.append("claude") }
            // Drop into an interactive login shell afterwards so the window stays.
            lines.append("exec \"$SHELL\" -l")
            let script = lines.joined(separator: "\n") + "\n"

            // ".command" so it's a valid shell script; we open it explicitly with
            // the resolved terminal app (not via the file's default handler, which
            // for .command is always Terminal.app).
            let scriptURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("projects-dashboard-\(UUID().uuidString).command")
            do {
                try script.write(to: scriptURL, atomically: true, encoding: .utf8)
                try FileManager.default.setAttributes(
                    [.posixPermissions: 0o700], ofItemAtPath: scriptURL.path)
            } catch {
                NSLog("openInTerminal: failed to write script: \(error)")
                return
            }

            let appURL = Self.resolveTerminalAppURL()
            let cfg = NSWorkspace.OpenConfiguration()
            cfg.activates = true
            NSWorkspace.shared.open([scriptURL], withApplicationAt: appURL, configuration: cfg) { _, error in
                if let error { NSLog("openInTerminal: open failed: \(error)") }
            }
        }

        /// Resolves which terminal app to use, honoring the user's default.
        /// Order: explicit Settings override → the system default handler for
        /// shell scripts (this is what reflects "default terminal", e.g. iTerm) →
        /// iTerm2 if installed → Terminal.
        static func resolveTerminalAppURL() -> URL {
            let ws = NSWorkspace.shared

            // 1. Explicit override from Settings (path, bundle id, or app name).
            let override = (UserDefaults.standard.string(forKey: "terminalApp") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !override.isEmpty {
                if override.hasPrefix("/"), FileManager.default.fileExists(atPath: override) {
                    return URL(fileURLWithPath: override)
                }
                if let url = ws.urlForApplication(withBundleIdentifier: override) { return url }
                let named = "/Applications/\(override).app"
                if FileManager.default.fileExists(atPath: named) { return URL(fileURLWithPath: named) }
            }

            // 2. System default handler for shell scripts. `public.shell-script`
            //    is what iTerm's "Make Default Term" registers; `.command`'s own
            //    UTI is intentionally avoided since it's hardwired to Terminal.
            for type in ["public.shell-script", "public.unix-executable"] {
                if let id = LSCopyDefaultRoleHandlerForContentType(type as CFString, .all)?
                    .takeRetainedValue() as String?,
                   let url = ws.urlForApplication(withBundleIdentifier: id) {
                    return url
                }
            }

            // 3. Prefer iTerm2 if present, else Terminal.
            if let url = ws.urlForApplication(withBundleIdentifier: "com.googlecode.iterm2") { return url }
            return ws.urlForApplication(withBundleIdentifier: "com.apple.Terminal")
                ?? URL(fileURLWithPath: "/System/Applications/Utilities/Terminal.app")
        }
    }
}
