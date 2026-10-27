import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BridgeConfig {
  port: number;
  host: string;
  allowedWorkspaceRoot: string;
  pairedToken: string;
}

export class LocalBridgeDaemon {
  private server: http.Server | null = null;
  private config: BridgeConfig;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = {
      port: config.port || 4545,
      host: '127.0.0.1', // Enforce loopback only
      allowedWorkspaceRoot: config.allowedWorkspaceRoot || path.join(process.cwd(), 'student_workspace'),
      pairedToken: config.pairedToken || 'local-dev-token-secret'
    };

    if (!fs.existsSync(this.config.allowedWorkspaceRoot)) {
      fs.mkdirSync(this.config.allowedWorkspaceRoot, { recursive: true });
    }
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server.listen(this.config.port, this.config.host, () => {
        resolve(this.config.port);
      });
      this.server.on('error', reject);
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // 1. CORS headers for localhost UI
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bridge-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // 2. Security Check: Origin & Host Validation (DNS Rebinding protection)
    const host = req.headers.host || '';
    if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Forbidden: Host header mismatch' }));
    }

    // 3. Security Check: Token Validation
    const authHeader = req.headers['x-bridge-token'] || req.headers.authorization?.replace(/^Bearer\s+/, '');
    if (authHeader !== this.config.pairedToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unauthorized: Invalid bridge token' }));
    }

    // Route dispatch
    const url = new URL(req.url || '/', `http://${this.config.host}:${this.config.port}`);

    if (req.method === 'GET' && url.pathname === '/bridge/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        workspace: this.config.allowedWorkspaceRoot,
        version: '1.0.0'
      }));
    }

    if (req.method === 'POST' && url.pathname === '/bridge/init-problem') {
      return this.handleInitProblem(req, res);
    }

    if (req.method === 'POST' && url.pathname === '/bridge/run-sample') {
      return this.handleRunSample(req, res);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  /**
   * Safe problem initialization: creates problem directory, starter file, and public sample files.
   * Path traversal guard strictly enforces isolation inside allowedWorkspaceRoot.
   */
  private async handleInitProblem(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readJsonBody(req);
    const { problemSlug, templateCode, samples } = body;

    // Strict validation of slug
    if (!problemSlug || !/^[a-z0-9_-]+$/i.test(problemSlug)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid problemSlug format' }));
    }

    const problemDir = path.resolve(this.config.allowedWorkspaceRoot, problemSlug);
    // Path traversal check
    if (!problemDir.startsWith(this.config.allowedWorkspaceRoot)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Path traversal denied' }));
    }

    if (!fs.existsSync(problemDir)) {
      fs.mkdirSync(problemDir, { recursive: true });
    }

    // Write starter template
    const mainFile = path.join(problemDir, 'main.cpp');
    if (!fs.existsSync(mainFile)) {
      fs.writeFileSync(mainFile, templateCode || '// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n');
    }

    // Write samples
    const samplesDir = path.join(problemDir, 'samples');
    if (!fs.existsSync(samplesDir)) {
      fs.mkdirSync(samplesDir, { recursive: true });
    }

    if (Array.isArray(samples)) {
      samples.forEach((sample: { input: string; output: string }, idx: number) => {
        fs.writeFileSync(path.join(samplesDir, `${idx + 1}.in`), sample.input || '');
        fs.writeFileSync(path.join(samplesDir, `${idx + 1}.out`), sample.output || '');
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      problemPath: problemDir,
      mainFilePath: mainFile,
      samplesCount: samples?.length || 0
    }));
  }

  /**
   * Safely compiles and tests local code against public samples without executing arbitrary shell strings.
   */
  private async handleRunSample(req: http.IncomingMessage, res: http.ServerResponse) {
    const body = await this.readJsonBody(req);
    const { problemSlug } = body;

    if (!problemSlug || !/^[a-z0-9_-]+$/i.test(problemSlug)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid problemSlug' }));
    }

    const problemDir = path.resolve(this.config.allowedWorkspaceRoot, problemSlug);
    if (!problemDir.startsWith(this.config.allowedWorkspaceRoot)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Path traversal denied' }));
    }

    const sourcePath = path.join(problemDir, 'main.cpp');
    const binPath = path.join(problemDir, 'solution_bin');

    if (!fs.existsSync(sourcePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'main.cpp not found in problem directory' }));
    }

    try {
      // 1. Compile locally with g++ using safe execFile (no shell interpolation)
      await execFileAsync('g++', ['-O2', '-std=c++17', sourcePath, '-o', binPath], {
        timeout: 10000,
        maxBuffer: 1024 * 1024
      });

      // 2. Read samples
      const samplesDir = path.join(problemDir, 'samples');
      const results: Array<{ index: number; passed: boolean; expected: string; actual: string }> = [];

      if (fs.existsSync(samplesDir)) {
        const inFiles = fs.readdirSync(samplesDir).filter(f => f.endsWith('.in')).sort();
        for (const inFile of inFiles) {
          const idx = parseInt(inFile.replace('.in', ''), 10);
          const sampleInput = fs.readFileSync(path.join(samplesDir, inFile), 'utf8');
          const outFile = path.join(samplesDir, `${idx}.out`);
          const expectedOutput = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim() : '';

          // Execute bin with sample input
          try {
            const stdout = await new Promise<string>((resolveRun, rejectRun) => {
              const child = execFile(binPath, [], { timeout: 2000, maxBuffer: 512 * 1024 }, (err, out) => {
                if (err) return rejectRun(err);
                resolveRun(out);
              });
              if (child.stdin) {
                child.stdin.write(sampleInput);
                child.stdin.end();
              }
            });
            const actualOutput = stdout.trim();
            results.push({
              index: idx,
              passed: actualOutput === expectedOutput,
              expected: expectedOutput,
              actual: actualOutput
            });
          } catch (runErr: any) {
            results.push({
              index: idx,
              passed: false,
              expected: expectedOutput,
              actual: `Runtime Error: ${runErr.message}`
            });
          }
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, compiled: true, results }));
    } catch (compileErr: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        compiled: false,
        compileError: compileErr.stderr || compileErr.message
      }));
    } finally {
      if (fs.existsSync(binPath)) {
        try { fs.unlinkSync(binPath); } catch (_) {}
      }
    }
  }

  private readJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => {
        data += chunk;
        if (data.length > 1024 * 1024) { // 1MB limit
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });
  }
}
