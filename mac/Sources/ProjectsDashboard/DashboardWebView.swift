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
        webView.uiDelegate = context.coordinator
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

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        var lastURL: String = ""

        private var dashboardHost: String? { URL(string: lastURL)?.host }

        // `target="_blank"` / window.open: WKWebView can't make a new window, so
        // open the link in the user's default browser instead.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                NSWorkspace.shared.open(url)
            }
            return nil
        }

        // Clicks on links to other hosts (GitHub, Railway, README links, …) open
        // in the default browser; in-app navigation stays inside the dashboard.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url,
               let scheme = url.scheme?.lowercased(),
               scheme == "http" || scheme == "https",
               url.host != nil, url.host != dashboardHost {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

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

        /// Opens a terminal at `path` (optionally launching `claude`) in a NEW
        /// window. For iTerm/Terminal we drive AppleScript so we control window
        /// vs. tab; other terminals fall back to opening a fresh app instance.
        private func openInTerminal(at path: String, runClaude: Bool) {
            let expanded = (path as NSString).expandingTildeInPath
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir) else {
                NSLog("openInTerminal: path does not exist: \(expanded)")
                return
            }

            // Shell command: cd into the project, optionally run claude.
            let shellPath = "'" + expanded.replacingOccurrences(of: "'", with: "'\\''") + "'"
            var command = "cd \(shellPath)"
            if runClaude { command += " && claude" }

            let appURL = Self.resolveTerminalAppURL()
            let bundleID = Bundle(url: appURL)?.bundleIdentifier ?? ""

            switch bundleID {
            case "com.googlecode.iterm2":
                runAppleScript([
                    "tell application \"iTerm\"",
                    "  set newWindow to (create window with default profile)",
                    "  tell current session of newWindow to write text \(asAppleScriptString(command))",
                    "  activate",
                    "end tell",
                ])
            case "com.apple.Terminal":
                // `do script` with no target window opens a NEW window.
                runAppleScript([
                    "tell application \"Terminal\"",
                    "  do script \(asAppleScriptString(command))",
                    "  activate",
                    "end tell",
                ])
            default:
                openViaScriptFile(command: command, appURL: appURL)
            }
        }

        /// Escapes a string as an AppleScript string literal.
        private func asAppleScriptString(_ s: String) -> String {
            let escaped = s
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            return "\"\(escaped)\""
        }

        private func runAppleScript(_ lines: [String]) {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            task.arguments = lines.flatMap { ["-e", $0] }
            do {
                try task.run()
            } catch {
                NSLog("runAppleScript failed: \(error)")
            }
        }

        /// Fallback for unknown terminals: write a temp script and open a fresh
        /// instance of the app (`-n`), which gives a new window for most terminals.
        private func openViaScriptFile(command: String, appURL: URL) {
            let script = "#!/bin/zsh\n\(command)\nexec \"$SHELL\" -l\n"
            let scriptURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("projects-dashboard-\(UUID().uuidString).command")
            do {
                try script.write(to: scriptURL, atomically: true, encoding: .utf8)
                try FileManager.default.setAttributes(
                    [.posixPermissions: 0o700], ofItemAtPath: scriptURL.path)
            } catch {
                NSLog("openViaScriptFile: failed to write script: \(error)")
                return
            }
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            task.arguments = ["-n", "-a", appURL.path, scriptURL.path]
            try? task.run()
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
