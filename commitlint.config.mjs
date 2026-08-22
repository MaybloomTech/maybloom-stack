export default {
  extends: ['@commitlint/config-conventional'],

  // Dependabot writes its own headers, and a grouped update appends
  // " in the <group> group across N directory" — 47 characters on top of an
  // ordinary bump, which pushed #14 to 114 and failed a 100-character rule.
  //
  // Exempting them is the right trade rather than raising the limit for
  // everyone: the rule exists to keep hand-written history legible, and a
  // machine-generated bump is already uniform whatever its length. Renaming
  // the group only buys a few characters before the next package with a long
  // name hits the same wall.
  //
  // The matcher requires the conventional prefix, so anything it exempts is
  // already correctly shaped — this waives the length, not the format.
  ignores: [(message) => /^(build|chore|ci)\(deps(-dev)?\): bump /.test(message)],
};
