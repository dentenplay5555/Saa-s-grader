import Database from 'better-sqlite3';

export interface TokenizedCode {
  tokens: string[];
  kgrams: Set<string>;
}

export interface PlagiarismPairResult {
  submissionA: number;
  submissionB: number;
  score: number;
  matchedTokens: number;
}

export class PlagiarismEngine {
  private static KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'auto',
    'const', 'struct', 'class', 'vector', 'string', 'queue', 'stack', 'set',
    'map', 'priority_queue', 'pair', 'cin', 'cout', 'endl', 'printf', 'scanf',
    'new', 'delete', 'sizeof', 'true', 'false', 'namespace', 'using'
  ]);

  /**
   * Tokenizes C/C++ source code by stripping comments and string literals,
   * normalizing identifiers, and extracting language tokens.
   */
  public static tokenize(source: string, k: number = 4): TokenizedCode {
    // 1. Remove comments
    let cleaned = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');

    // 2. Normalize preprocessor directives
    cleaned = cleaned.replace(/^\s*#\s*[a-zA-Z]+/gm, 'PREPROC');

    // 3. Normalize string and char literals
    cleaned = cleaned
      .replace(/"([^"\\]|\\.)*"/g, 'STR_LIT')
      .replace(/'([^'\\]|\\.)*'/g, 'CHAR_LIT');

    // 4. Tokenize identifiers, keywords, and operators
    const rawTokens = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_]*|==|!=|<=|>=|\+\+|--|<<|>>|&&|\|\||[+\-*/%<>=!&|^~?:;.,(){}\[\]]/g) || [];
    
    const tokens: string[] = rawTokens.map(tok => {
      const lower = tok.toLowerCase();
      if (this.KEYWORDS.has(lower)) {
        return lower;
      }
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok)) {
        return 'ID'; // Normalize identifiers to catch renamed variables
      }
      return tok;
    });

    // 5. Build k-grams
    const kgrams = new Set<string>();
    if (tokens.length >= k) {
      for (let i = 0; i <= tokens.length - k; i++) {
        kgrams.add(tokens.slice(i, i + k).join('_'));
      }
    } else if (tokens.length > 0) {
      kgrams.add(tokens.join('_'));
    }

    return { tokens, kgrams };
  }

  /**
   * Calculates Jaccard similarity coefficient between two sets of k-grams.
   */
  public static calculateSimilarity(codeA: string, codeB: string, k: number = 4): { score: number; matchedTokens: number } {
    const tA = this.tokenize(codeA, k);
    const tB = this.tokenize(codeB, k);

    if (tA.kgrams.size === 0 || tB.kgrams.size === 0) {
      return { score: 0, matchedTokens: 0 };
    }

    let intersectionCount = 0;
    for (const g of tA.kgrams) {
      if (tB.kgrams.has(g)) {
        intersectionCount++;
      }
    }

    const unionCount = new Set([...tA.kgrams, ...tB.kgrams]).size;
    const score = unionCount === 0 ? 0 : Math.round((intersectionCount / unionCount) * 1000) / 1000;
    
    return {
      score,
      matchedTokens: intersectionCount * k
    };
  }

  /**
   * Runs a batch similarity analysis across submissions for a specific problem version or problem.
   */
  public static runBatch(
    db: Database.Database,
    problemId: number,
    threshold: number = 0.75,
    actorId?: number
  ): { reportId: number; pairsCount: number } {
    // 1. Create similarity_reports entry
    const reportInsert = db.prepare(`
      INSERT INTO similarity_reports (scope_type, scope_id, tool, tool_version, threshold, created_by, status)
      VALUES ('problem', ?, 'dsa-plagiarism-v1', '1.0.0', ?, ?, 'RUNNING')
    `).run(problemId, threshold, actorId || null);

    const reportId = Number(reportInsert.lastInsertRowid);

    try {
      // 2. Fetch distinct latest submissions per student for this problem with status DONE
      const submissions = db.prepare(`
        SELECT s.id, s.user_id, s.source_code
        FROM submissions s
        JOIN problem_versions pv ON s.problem_version_id = pv.id
        WHERE pv.problem_id = ? AND s.status = 'DONE'
        ORDER BY s.id DESC
      `).all(problemId) as Array<{ id: number; user_id: number; source_code: string }>;

      // Deduplicate to latest submission per user
      const userSubmissions = new Map<number, { id: number; source_code: string }>();
      for (const sub of submissions) {
        if (!userSubmissions.has(sub.user_id)) {
          userSubmissions.set(sub.user_id, { id: sub.id, source_code: sub.source_code });
        }
      }

      const candidateList = Array.from(userSubmissions.values());
      const insertPair = db.prepare(`
        INSERT INTO similarity_pairs (
          report_id, submission_a, submission_b, score, matched_tokens, reviewed_status
        ) VALUES (?, ?, ?, ?, ?, 'pending')
      `);

      let pairsCount = 0;

      for (let i = 0; i < candidateList.length; i++) {
        for (let j = i + 1; j < candidateList.length; j++) {
          const subA = candidateList[i];
          const subB = candidateList[j];

          const sim = this.calculateSimilarity(subA.source_code, subB.source_code);
          if (sim.score >= threshold) {
            insertPair.run(reportId, subA.id, subB.id, sim.score, sim.matchedTokens);
            pairsCount++;
          }
        }
      }

      // Mark report completed
      db.prepare("UPDATE similarity_reports SET status = 'COMPLETED' WHERE id = ?").run(reportId);

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail)
        VALUES (?, 'RUN_PLAGIARISM_CHECK', 'similarity_reports', ?, ?)
      `).run(
        actorId || null,
        reportId,
        JSON.stringify({ problemId, threshold, candidatesAnalyzed: candidateList.length, pairsFlagged: pairsCount })
      );

      return { reportId, pairsCount };
    } catch (err: any) {
      db.prepare("UPDATE similarity_reports SET status = 'FAILED' WHERE id = ?").run(reportId);
      throw err;
    }
  }
}
