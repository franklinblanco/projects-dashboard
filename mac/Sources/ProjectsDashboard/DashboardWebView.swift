import SwiftUI
import WebKit

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

        /// Opens a terminal at `path` (optionally launching `claude`) using the
        /// system's *default* terminal. We write a temporary `.command` script
        /// and `open` it with no `-a`, so whichever app the user has set as the
        /// default handler for `.command` files runs it (Terminal, iTerm, etc.).
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

            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
            task.arguments = [scriptURL.path]
            do {
                try task.run()
            } catch {
                NSLog("openInTerminal failed: \(error)")
            }
        }
    }
}
