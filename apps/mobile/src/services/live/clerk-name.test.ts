import { resolveClerkDisplayName } from './clerk-name';

test.each([
  [
    { fullName: '  Adel Mohamed  ', firstName: 'Ignored', lastName: 'Name' },
    'Adel Mohamed'
  ],
  [{ fullName: null, firstName: 'Adel', lastName: 'Mohamed' }, 'Adel Mohamed'],
  [{ fullName: null, firstName: 'Adel', lastName: null }, 'Adel'],
  [{ fullName: '   ', firstName: null, lastName: null }, null]
])('resolves the Clerk profile name from %o', (user, expected) => {
  expect(resolveClerkDisplayName(user)).toBe(expected);
});
