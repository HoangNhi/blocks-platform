'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseJsonArg(raw, fallback) {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function resolveFromCwd(value, cwd) {
  if (!value) {
    return value;
  }
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[\s"]/u.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function runCodex(prompt, config) {
  const defaultWorkingDir = path.resolve(__dirname, '../../..');
  const workingDir = path.resolve(config.workingDir || defaultWorkingDir);
  const codexPath = config.codexPath || 'codex';
  const schemaPath = resolveFromCwd(
    config.schemaPath || 'tests/agent-workflow-evals/schemas/workflow-output.schema.json',
    workingDir,
  );
  const timeoutMs = Number(config.timeoutMs || 600000);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-codex-eval-'));
  const outputPath = path.join(tempDir, 'last-message.json');

  const args = [
    'exec',
    '--ephemeral',
    '--sandbox',
    'read-only',
    '--cd',
    workingDir,
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputPath,
    '--color',
    'never',
    '--config',
    'sandbox_workspace_write.network_access=false',
    '--config',
    'approval_policy=never',
    '-',
  ];

  const command = [codexPath, ...args].map(quoteCmdArg).join(' ');
  const child = childProcess.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', command], {
    cwd: workingDir,
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  const outputLimit = 20000;
  child.stdout.on('data', (chunk) => {
    stdout = (stdout + String(chunk)).slice(-outputLimit);
  });
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + String(chunk)).slice(-outputLimit);
  });

  child.stdin.end(prompt, 'utf8');

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`codex exec timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`codex exec exited ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }
      try {
        const finalMessage = fs.readFileSync(outputPath, 'utf8').trim();
        resolve(finalMessage);
      } catch (error) {
        reject(new Error(`codex exec did not write final message: ${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
}

(async () => {
  const prompt = process.argv[2] || '';
  const options = parseJsonArg(process.argv[3], {});
  const config = options.config || options || {};

  try {
    const output = await runCodex(prompt, config);
    process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
})();
