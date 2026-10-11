import { wantsVoiceEventResults } from '../../../src/ai/ai.dto';

it.each([
  [undefined, false],
  ['application/json', false],
  ['application/json; voice-event-results=1', true],
  ['text/plain, application/json; voice-event-results="1"', true],
  ['application/json; voice-event-results=0', false],
  ['application/json; voice-event-results=11', false],
  ['text/plain; voice-event-results=1', false],
  ['application/json; x-voice-event-results=1', false],
])('negotiates event results only for an explicit JSON opt-in %s', (accept, expected) => {
  expect(wantsVoiceEventResults(accept)).toBe(expected);
});
