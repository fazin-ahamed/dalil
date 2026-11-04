# Build Dalil on Windows

This source includes the improved chat, computer control, movable panels, tray menu, Windows shortcuts and staged notch hiding.

## Install prerequisites

- [Node.js LTS](https://nodejs.org/en/download).
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/): select **Desktop development with C++**, including the MSVC compiler and Windows SDK.
- [Rust via rustup](https://www.rust-lang.org/tools/install), with the MSVC toolchain.
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section), using the Evergreen installer.

See [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows). Reopen the terminal after installing tools.

## Compile the x64 executable

Extract the archive first. Open PowerShell in the extracted `Dalil` folder, then run each command below. Stop if a command fails.

```powershell
cd ui
rustup toolchain install stable-x86_64-pc-windows-msvc
rustup override set stable-x86_64-pc-windows-msvc
npm.cmd ci
npm.cmd run shell:build:win
```

The output is `ui\src-tauri\target\x86_64-pc-windows-msvc\release\dalil.exe`, relative to the extracted `Dalil` folder. From the `ui` terminal, open chat with:

```powershell
& .\src-tauri\target\x86_64-pc-windows-msvc\release\dalil.exe --ask
```

## Build an installer

From the same `ui` terminal:

```powershell
npm.cmd run tauri -- build --target x86_64-pc-windows-msvc --bundles nsis
```

The setup executable appears under `ui\src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\`. The existing installer configuration downloads and installs WebView2 when needed, so installation requires internet access. The standalone executable needs WebView2 already installed. See [Tauri's installer documentation](https://v2.tauri.app/distribute/windows-installer/#downloaded-bootstrapper).

## If the app appears not to open

Check the system tray overflow and press **Ctrl+Alt+Space**. The notch disappears after inactivity, and its window has no taskbar button. Left-click its tray icon to reopen chat; right-click for **Exit Dalil**.

If no tray icon appears, close any existing Dalil instance in Task Manager, then run a development build from the `ui` terminal to capture startup errors:

```powershell
npm.cmd run shell:dev 2>&1 | Tee-Object -FilePath .\windows-startup.log
```

Keep this terminal open while testing. If startup fails, share the error from `windows-startup.log`. A local build does not establish why the earlier executable failed to open.
