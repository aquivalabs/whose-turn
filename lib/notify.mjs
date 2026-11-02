/** Desktop notification: osascript on macOS, notify-send where it exists, silence elsewhere. */
import { execFile } from 'node:child_process';
import { platform } from 'node:process';

const clean = (text, limit) => String(text || '').replace(/"/g, '\'').slice(0, limit);

export const notify = (title, body) => {
  const safeTitle = clean(title, 120);
  const safeBody = clean(body, 240);
  if (platform === 'darwin') {
    execFile('osascript', ['-e', `display notification "${safeBody}" with title "${safeTitle}" sound name "Glass"`], () => {});
    return;
  }
  if (platform === 'linux') {
    execFile('notify-send', [safeTitle, safeBody], () => {});
  }
};
