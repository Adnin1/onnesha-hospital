import { spawnSync } from 'child_process';
import path from 'path';

const keyPath = path.join(process.env.USERPROFILE || '', '.ssh', 'id_ed25519_deploy').replace(/\\/g, '/');
const sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=accept-new`;

const action = process.argv[2] || 'status';

if (action === 'fetch') {
  const res = spawnSync('git', ['fetch', 'ssh-origin', '--prune', '--tags'], {
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
    encoding: 'utf8',
  });
  spawnSync('git', ['fetch', 'origin', '--prune', '--tags'], {
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
    encoding: 'utf8',
  });
  console.log('Fetch exit code:', res.status);
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.log(res.stderr);
} else if (action === 'push') {
  const res = spawnSync('git', ['push', 'ssh-origin', 'main', '--follow-tags'], {
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
    encoding: 'utf8',
  });
  console.log('Push exit code:', res.status);
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.log(res.stderr);
  process.exit(res.status || 0);
} else if (action === 'push-tags') {
  const res = spawnSync('git', ['push', 'ssh-origin', '--tags', '--force'], {
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
    encoding: 'utf8',
  });
  console.log('Push tags exit code:', res.status);
  if (res.stdout) console.log(res.stdout);
  if (res.stderr) console.log(res.stderr);
  process.exit(res.status || 0);
} else if (action === 'ls-remote') {
  const res = spawnSync('git', ['ls-remote', 'ssh-origin', 'main'], {
    env: { ...process.env, GIT_SSH_COMMAND: sshCmd },
    encoding: 'utf8',
  });
  console.log(res.stdout.trim());
} else {
  console.log('Available actions: fetch, push, ls-remote');
}
