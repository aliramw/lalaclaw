# macOS launchd Deploy

This folder contains a reusable `launchd` template and a helper script for running LalaClaw as a background service on macOS.

## Files

- `ai.lalaclaw.app.plist.example`: template launch agent plist
- `generate-launchd-plist.sh`: generates a ready-to-load plist for your local checkout
- `install-libreoffice.sh`: installs LibreOffice with Homebrew for LibreOffice-backed preview support

## Generate The Plist

From the project root:

```bash
npm ci
npm run doctor
npm run lalaclaw:init
npm run build
./deploy/macos/generate-launchd-plist.sh
```

If LibreOffice-backed preview support is missing, you can install LibreOffice with either of these:

```bash
lalaclaw doctor --fix
./deploy/macos/install-libreoffice.sh
```

By default this writes:

```text
~/Library/LaunchAgents/ai.lalaclaw.app.plist
```

It also creates:

```text
./logs/
```

You can override both the project root and output path:

```bash
./deploy/macos/generate-launchd-plist.sh /absolute/path/to/lalaclaw ~/Library/LaunchAgents/ai.lalaclaw.app.plist
```

## Load The Service

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl enable gui/$(id -u)/ai.lalaclaw.app
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

## Common Commands

Check status:

```bash
launchctl print gui/$(id -u)/ai.lalaclaw.app
```

Reload after config or build changes:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl kickstart -k gui/$(id -u)/ai.lalaclaw.app
```

Stop and remove:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.lalaclaw.app.plist
launchctl disable gui/$(id -u)/ai.lalaclaw.app
```

Tail logs:

```bash
tail -f ./logs/lalaclaw-launchd.out.log
tail -f ./logs/lalaclaw-launchd.err.log
```
