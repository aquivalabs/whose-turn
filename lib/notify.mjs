/** Desktop notification: osascript on macOS, notify-send on Linux, a PowerShell balloon on Windows. Title and body travel as argv or environment, never inside a script string. */
import { execFile } from 'node:child_process';

const clean = (text, limit) => String(text || '').slice(0, limit);

const MAC_SCRIPT = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"', 'end run'];

const WINDOWS_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$icon = New-Object System.Windows.Forms.NotifyIcon',
  '$icon.Icon = [System.Drawing.SystemIcons]::Information',
  '$icon.Visible = $true',
  '$icon.ShowBalloonTip(5000, $env:WHOSE_TURN_TITLE, $env:WHOSE_TURN_BODY, [System.Windows.Forms.ToolTipIcon]::Info)',
  'Start-Sleep -Seconds 6',
  '$icon.Dispose()',
].join('; ');

const COMMANDS = {
  darwin: (title, body) => ['osascript', [...MAC_SCRIPT.flatMap((line) => ['-e', line]), title, body]],
  linux: (title, body) => ['notify-send', [title, body]],
  win32: (title, body) => [
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT],
    { WHOSE_TURN_TITLE: title, WHOSE_TURN_BODY: body },
  ],
};

/** True under a test runner (node:test passes NODE_TEST_CONTEXT to child processes, Vitest sets VITEST) or when WHOSE_TURN_NOTIFY=off. */
export const muted = (env = process.env) => Boolean(env.NODE_TEST_CONTEXT || env.VITEST) || env.WHOSE_TURN_NOTIFY === 'off';

const launch = (file, args, env) => {
  if (!muted()) {
    execFile(file, args, { env: { ...process.env, ...env } }, () => {});
  }
};

/** Sends one desktop notification; `enabled: false` stays silent. */
export const notify = (title, body, { platform = process.platform, run = launch, enabled = true } = {}) => {
  const build = COMMANDS[platform];
  if (build && enabled) {
    run(...build(clean(title, 120), clean(body, 240)));
  }
};

/** A notify function that asks `isOn()` on every call. */
export const notifier = (isOn) => (title, body) => notify(title, body, { enabled: isOn() });
