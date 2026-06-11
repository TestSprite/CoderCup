import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lambdaSend = vi.fn();

process.env.RUNS_BUCKET = 'codearena-runs-123456789012';

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = lambdaSend;
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

beforeEach(() => {
  lambdaSend.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('invokeScorer', () => {
  it('synthesizes an S3Event-shaped payload for the configured run', async () => {
    lambdaSend.mockResolvedValueOnce({});
    const { invokeScorer } = await import('./invoke-scorer');

    await invokeScorer('run-abc-123');

    expect(lambdaSend).toHaveBeenCalledOnce();
    const cmd = lambdaSend.mock.calls[0][0] as { input: { FunctionName: string; Payload: Buffer; InvocationType: string } };
    expect(cmd.input.FunctionName).toBe('codearena-score-runner');
    expect(cmd.input.InvocationType).toBe('Event');
    const payload = JSON.parse(cmd.input.Payload.toString('utf8'));
    expect(payload.Records).toHaveLength(1);
    expect(payload.Records[0].s3.object.key).toBe('runs/run-abc-123/manifest.json');
    expect(payload.Records[0].s3.bucket.name).toBe('codearena-runs-123456789012');
  });

  it('swallows Lambda invoke errors (driver should not fail because of scorer)', async () => {
    lambdaSend.mockRejectedValueOnce(new Error('AccessDenied: role missing lambda:InvokeFunction'));
    const { invokeScorer } = await import('./invoke-scorer');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Should NOT throw — driver's job is done by this point.
    await expect(invokeScorer('run-fails')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('run-fails');
    expect(msg).toContain('AccessDenied');
  });
});
