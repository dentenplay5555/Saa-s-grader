/**
 * Offline Store & Submission Outbox (Section 15: Level 1 Offline Mode)
 * Provides local draft autosaving, lesson progress caching, and an outbox queue
 * for offline code submissions that sync upon network reconnection.
 */

export interface QueuedSubmission {
  idempotencyKey: string;
  problemSlug: string;
  problemVersionId: number;
  language: string;
  sourceCode: string;
  localCreatedAt: string;
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
  errorMessage?: string;
}

export class OfflineStore {
  private static DRAFT_PREFIX = 'dsa_draft_';
  private static OUTBOX_KEY = 'dsa_submission_outbox';
  private static SETTINGS_KEY = 'dsa_user_settings';

  /**
   * Autosave draft code for a problem and language
   */
  public static saveDraft(problemSlug: string, language: string, sourceCode: string): void {
    try {
      const key = `${this.DRAFT_PREFIX}${problemSlug}_${language}`;
      localStorage.setItem(key, JSON.stringify({
        sourceCode,
        updatedAt: new Date().toISOString()
      }));
    } catch (_) {}
  }

  /**
   * Retrieve saved draft code
   */
  public static loadDraft(problemSlug: string, language: string): string | null {
    try {
      const key = `${this.DRAFT_PREFIX}${problemSlug}_${language}`;
      const item = localStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item);
        return parsed.sourceCode || null;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Enqueue submission into outbox when offline
   */
  public static enqueueSubmission(sub: Omit<QueuedSubmission, 'status'>): QueuedSubmission {
    const outbox = this.getOutbox();
    const queued: QueuedSubmission = {
      ...sub,
      status: 'PENDING_SYNC'
    };
    outbox.push(queued);
    localStorage.setItem(this.OUTBOX_KEY, JSON.stringify(outbox));
    return queued;
  }

  /**
   * Get all submissions in the outbox
   */
  public static getOutbox(): QueuedSubmission[] {
    try {
      const item = localStorage.getItem(this.OUTBOX_KEY);
      return item ? JSON.parse(item) : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Remove or update submission in outbox after successful sync
   */
  public static markSynced(idempotencyKey: string): void {
    const outbox = this.getOutbox().filter(s => s.idempotencyKey !== idempotencyKey);
    localStorage.setItem(this.OUTBOX_KEY, JSON.stringify(outbox));
  }

  /**
   * Synchronize pending outbox submissions with server
   */
  public static async syncOutbox(
    submitFn: (sub: QueuedSubmission) => Promise<{ submissionId: number }>
  ): Promise<{ synced: number; failed: number }> {
    const outbox = this.getOutbox();
    let synced = 0;
    let failed = 0;

    for (const sub of outbox) {
      if (sub.status === 'PENDING_SYNC') {
        try {
          await submitFn(sub);
          this.markSynced(sub.idempotencyKey);
          synced++;
        } catch (err: any) {
          failed++;
        }
      }
    }

    return { synced, failed };
  }

  /**
   * Save layout preferences (Split vs Focus mode, split ratio, font size)
   */
  public static saveLayoutSettings(settings: { layoutMode: 'split' | 'focus'; splitRatio: number; fontSize: number }): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  /**
   * Load layout preferences
   */
  public static loadLayoutSettings(): { layoutMode: 'split' | 'focus'; splitRatio: number; fontSize: number } {
    try {
      const item = localStorage.getItem(this.SETTINGS_KEY);
      if (item) {
        return JSON.parse(item);
      }
    } catch (_) {}
    return { layoutMode: 'split', splitRatio: 50, fontSize: 14 };
  }
}
