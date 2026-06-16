import SwiftUI

@main
struct ProjectsDashboardApp: App {
    @AppStorage("dashboardURL") private var dashboardURL: String = "http://localhost:8080"
    @State private var showSettings = false

    var body: some Scene {
        WindowGroup("Projects Dashboard") {
            DashboardWebView(urlString: dashboardURL)
                .frame(minWidth: 900, minHeight: 600)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                        }
                    }
                }
                .sheet(isPresented: $showSettings) {
                    SettingsView(dashboardURL: $dashboardURL, isPresented: $showSettings)
                }
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
    }
}

struct SettingsView: View {
    @Binding var dashboardURL: String
    @Binding var isPresented: Bool
    @AppStorage("terminalApp") private var terminalApp: String = ""
    @State private var draft: String = ""
    @State private var terminalDraft: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Dashboard URL").font(.headline)
            Text("Point the app at your deployed dashboard, or http://localhost:8080 for local dev.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("http://localhost:8080", text: $draft)
                .textFieldStyle(.roundedBorder)
                .frame(width: 380)

            Divider()

            Text("Terminal app").font(.headline)
            Text("Leave blank to use your system default terminal. Otherwise an app name (e.g. iTerm), bundle id, or full path.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("(system default)", text: $terminalDraft)
                .textFieldStyle(.roundedBorder)
                .frame(width: 380)

            HStack {
                Spacer()
                Button("Cancel") { isPresented = false }
                Button("Save") {
                    if !draft.isEmpty { dashboardURL = draft }
                    terminalApp = terminalDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                    isPresented = false
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(24)
        .onAppear {
            draft = dashboardURL
            terminalDraft = terminalApp
        }
    }
}
