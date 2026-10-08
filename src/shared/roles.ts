/**
 * Who sits where on a shared Team Terminal (SPEC section 5).
 *
 * Roles rotate every rotateEvery years so the same student does not hold the
 * keyboard all lesson. The rotation is a pure function of the year, so the
 * terminal, the dashboard and a reprinted role card always agree.
 *
 * v2 has two roles. The Analyst only existed to run the What-if calculator and
 * the forecasts of the other countries, and both of those are gone, so a group
 * that still had one would have nothing to give them to do.
 */

export const ROLE_NAMES = ['Operator', 'Envoy'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface RoleAssignment {
  /** Sits at the keyboard and enters the decision. */
  operator: string;
  /**
   * Writes the messages and goes to the summits.
   *
   * Usually one person. A group of three or four shares the job, because two
   * roles between four students would leave two of them watching.
   */
  envoys: string[];
  /** Which rotation block this is, counting from 0. */
  block: number;
}

/**
 * Which rotation block a year falls in: floor((year - 1) / rotateEvery).
 *
 * The practice year is year 0 and shares block 0 with Year 1, so a group keeps
 * the same roles from its first practice run into its first scored year.
 */
export function roleBlock(year: number, rotateEvery: number): number {
  if (year <= 0) return 0;
  return Math.floor((year - 1) / Math.max(1, rotateEvery));
}

/** The default names a group gets before it types its own (SPEC section 5). */
export function defaultMembers(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Member ${String(i + 1)}`);
}

/**
 * Hands out the roles for one year.
 *
 * With 1 member one person does both jobs; with 2 it is one each; with 3 or 4
 * everyone after the Operator is an Envoy. The list is rotated by the block, so
 * everyone takes a turn at the keyboard.
 */
export function rolesForYear(
  members: readonly string[],
  year: number,
  rotateEvery: number,
): RoleAssignment {
  const people = members.length > 0 ? [...members] : defaultMembers(1);
  const block = roleBlock(year, rotateEvery);
  const shift = block % people.length;
  const order = [...people.slice(shift), ...people.slice(0, shift)];

  const first = order[0] ?? 'Member 1';
  if (order.length === 1) return { operator: first, envoys: [first], block };
  return { operator: first, envoys: order.slice(1), block };
}

/** "Jared", or "Jared and Mia" when a group shares the job. */
export function envoyNames(roles: RoleAssignment): string {
  const names = roles.envoys;
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}
