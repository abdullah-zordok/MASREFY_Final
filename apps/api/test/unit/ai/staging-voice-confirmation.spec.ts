import { StagingVoiceWorker } from '../../../src/ai/staging-voice.worker';

function runtime(mode: string, confirm: (epoch: string) => Promise<void>) {
  const epoch = '11111111-1111-4111-8111-111111111111';
  const repository = {
    voiceEpochHeartbeat: jest.fn().mockResolvedValue({ enabled: true, mode }),
    claimVoiceEpochWork: jest.fn().mockResolvedValue([]),
    finalizeVoiceEpoch: jest.fn().mockResolvedValue(true),
    claimVoiceEpochPurges: jest.fn().mockResolvedValue([]),
    closeVoiceEpoch: jest.fn(),
  };
  const worker = Reflect.construct(StagingVoiceWorker, [
    repository,
    {},
    {},
    epoch,
    'owned-worker',
    'a'.repeat(40),
    () => undefined,
    confirm,
  ]) as StagingVoiceWorker;
  return { worker, repository, epoch };
}

it('confirms only its operating epoch after financial finalization without a general scheduler', async () => {
  const confirm = jest.fn().mockResolvedValue(undefined);
  const { worker, repository, epoch } = runtime('operating', confirm);
  await worker.tick();
  expect(repository.finalizeVoiceEpoch).toHaveBeenCalledWith(epoch, 1, false);
  expect(confirm).toHaveBeenCalledWith(epoch);
  expect(repository.closeVoiceEpoch).not.toHaveBeenCalled();
});

it('preserves the one-event canary scope without notification delivery changes', async () => {
  const confirm = jest.fn().mockResolvedValue(undefined);
  const { worker } = runtime('canary', confirm);
  await worker.tick();
  expect(confirm).not.toHaveBeenCalled();
});

it('retries confirmation separately without reporting saved financial work as failed', async () => {
  const confirm = jest
    .fn()
    .mockRejectedValueOnce(new Error('provider unavailable'))
    .mockResolvedValue(undefined);
  const { worker, repository } = runtime('operating', confirm);
  const log = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    await worker.tick();
    await worker.tick();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(repository.closeVoiceEpoch).not.toHaveBeenCalled();
    expect(log.mock.calls.map(([line]) => String(line)).join('')).toContain(
      'VOICE_CONFIRMATION_FAILED',
    );
  } finally {
    log.mockRestore();
  }
});
