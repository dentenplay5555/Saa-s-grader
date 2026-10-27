import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface BridgeConfig {
  port: number;
  host: string;
  allowedWorkspaceRoot: string;
  pairedToken: string;
}

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

export class LocalBridgeDaemon {
  private server: http.Server | null = null;
  private config: BridgeConfig;

  constructor(config: Partial<BridgeConfig> = {}) {
    // Generate secure random token if not explicitly provided - NEVER use insecure hardcoded fallback!
    const token = config.pairedToken || crypto.randomBytes(32).toString('hex');
    this.config = {
      port: config.port || 4545,
      host: '127.0.0.1', // Enforce loopback only
      allowedWorkspaceRoot: config.allowedWorkspaceRoot || path.join(process.cwd(), 'student_workspace'),
      pairedToken: token,
    };

    if (!fs.existsSync(this.config.allowedWorkspaceRoot)) {
      fs.mkdirSync(this.config.allowedWorkspaceRoot, { recursive: true });
    }
  }

  public get pairedToken(): string {
    return this.config.pairedToken;
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
    try {
      // 1. Strict Origin Validation - NEVER reflect untrusted Origin!
      const origin = req.headers.origin;
      if (origin) {
        if (!ALLOWED_ORIGINS.has(origin)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Forbidden: Untrusted Origin' }));
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3000');
      }

      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bridge-Token');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      // 2. Strict Host Validation - EXACT match, prevents DNS rebinding (e.g. localhost.evil.com)
      const host = (req.headers.host || '').toLowerCase();
      const validHosts = new Set([
        '127.0.0.1',
        'localhost',
        `127.0.0.1:${this.config.port}`,
        `localhost:${this.config.port}`,
      ]);

      if (!validHosts.has(host)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Forbidden: Host header mismatch' }));
      }

      // 3. Token Authentication
      const authHeader = (req.headers['x-bridge-token'] as string) || req.headers.authorization?.replace(/^Bearer\s+/, '');
      if (!authHeader || authHeader !== this.config.pairedToken) {
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
          version: '1.0.0',
        }));
      }

      // Web is ONLY permitted to initialize problem workspace template/samples.
      // Web is STRICTLY FORBIDDEN from executing programs or triggering compiler runs on the local machine!
      if (req.method === 'POST' && url.pathname === '/bridge/init-problem') {
        return await this.handleInitProblem(req, res);
      }

      // Any attempt by web to trigger program execution returns 403 Forbidden
      if (url.pathname === '/bridge/run-sample') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Security Violation: Web is not permitted to trigger code execution on local machine. Use local CLI or IDE command.'
        }));
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Bad Request' }));
      }
    }
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
    // Strict path traversal containment check
    if (!problemDir.startsWith(this.config.allowedWorkspaceRoot)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Path traversal denied' }));
    }

    if (!fs.existsSync(problemDir)) {
      fs.mkdirSync(problemDir, { recursive: true });
    }

    // Write starter template (only if it doesn't already exist to preserve student's work)
    const mainFile = path.join(problemDir, 'main.cpp');
    if (!fs.existsSync(mainFile)) {
      fs.writeFileSync(mainFile, templateCode || '// Write your solution here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n');
    }

    // Write public samples
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
      samplesCount: samples?.length || 0,
    }));
  }

  /**
   * Local CLI helper: compiles and runs samples LOCALLY by user request (not via web endpoint).
   */
  public async runLocalSample(problemSlug: string): Promise<{
    ok: boolean;
    compiled: boolean;
    compileError?: string;
    results?: Array<{ index: number; passed: boolean; expected: string; actual: string }>;
  }> {
    if (!problemSlug || !/^[a-z0-9_-]+$/i.test(problemSlug)) {
      throw new Error('Invalid problemSlug');
    }

    const problemDir = path.resolve(this.config.allowedWorkspaceRoot, problemSlug);
    if (!problemDir.startsWith(this.config.allowedWorkspaceRoot)) {
      throw new Error('Path traversal denied');
    }

    const sourcePath = path.join(problemDir, 'main.cpp');
    const binPath = path.join(problemDir, 'solution_bin');

    if (!fs.existsSync(sourcePath)) {
      throw new Error('main.cpp not found in problem directory');
    }

    try {
      // 1. Compile locally with g++ using safe execFile (no shell interpolation)
      await execFileAsync('g++', ['-O2', '-std=c++17', sourcePath, '-o', binPath], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
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
              actual: actualOutput,
            });
          } catch (runErr: any) {
            results.push({
              index: idx,
              passed: false,
              expected: expectedOutput,
              actual: `Runtime Error: ${runErr.message}`,
            });
          }
        }
      }

      return { ok: true, compiled: true, results };
    } catch (compileErr: any) {
      return {
        ok: false,
        compiled: false,
        compileError: compileErr.stderr || compileErr.message,
      };
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
        if (data.length > 1024 * 1024) {
          req.destroy();
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          reject(new Error('Invalid JSON format'));
        }
      });
      req.on('error', reject);
    });
  }
}
