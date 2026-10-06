/**
 * Who sits where on a shared Team Terminal (SPEC section 5).
 *
 * Roles rotate every rotateEvery years so the same student does not hold the
 * keyboard all lesson. The rotation is a pure function of the year, so the
 * terminal, the dashboard and a reprinted role card always agree.
 */

export const ROLE_NAMES = ['Operator', 'Analyst', 'Envoy'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface RoleAssignment {
  /** Sits at the keyboard and enters the decision. */
  operator: string;
  /** Runs the What-if calculator. Two of them when the group has four members. */
  analysts: string[];
  /** Writes messages and goes to summits. */
  envoy: string;
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
 * Hands out the three roles for one year.
 *
 * With 1 member one person does everything; with 2 the Operator is also the
 * Analyst; with 4 the extra member is a second Analyst. The list is rotated by
 * the block, so everyone takes a turn at the keyboard.
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
  if (order.length === 1) {
    return { operator: first, analysts: [first], envoy: first, block };
  }
  if (order.length === 2) {
    const second = order[1] ?? first;
    return { operator: first, analysts: [first], envoy: second, block };
  }

  const second = order[1] ?? first;
  const third = order[2] ?? first;
  const analysts = order.length >= 4 ? [second, order[3] ?? second] : [second];
  return { operator: first, analysts, envoy: third, block };
}
