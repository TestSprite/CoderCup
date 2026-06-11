/**
 * Lightweight running accumulator for token / iteration / cost counters.
 * Drivers update this on each tool call and each parsed usage-snapshot
 * line from the underlying CLI's output; the LiveStream picks it up and
 * the manifest-writer reads .snapshot() at run end.
 */
import { imputedCost } from '../../scoring/rates';

export interface UsageSnapshotData {
  promptTokens: number;
  completionTokens: number;
  iterations: number;
  usdImputed: number;
}

export class UsageMeter {
  private prompt = 0;
  private completion = 0;
  private iters = 0;

  constructor(private readonly modelId: string) {}

  recordIteration(): void {
    this.iters += 1;
  }

  setTokens(prompt: number, completion: number): void {
    // Setters (not accumulators) - CLIs typically report cumulative counts.
    if (prompt > this.prompt) this.prompt = prompt;
    if (completion > this.completion) this.completion = completion;
  }

  addTokens(prompt: number, completion: number): void {
    this.prompt += prompt;
    this.completion += completion;
  }

  snapshot(): UsageSnapshotData {
    const { usd } = imputedCost(this.modelId, this.prompt, this.completion);
    return {
      promptTokens: this.prompt,
      completionTokens: this.completion,
      iterations: this.iters,
      usdImputed: usd,
    };
  }
}
