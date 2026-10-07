import type { RoleAssignment } from '@shared/roles';

/**
 * Who does what this year (SPEC section 5). One line, because it is a reminder
 * and not a screen of its own: the Operator types, the Analyst calculates, the
 * Envoy writes and goes to summits.
 */
export function RolesLine({ roles }: { roles: RoleAssignment }) {
  const analysts = roles.analysts.join(' and ');
  return (
    <p className="roles">
      <span className="roles-lead">This year</span> - Operator: <strong>{roles.operator}</strong>,{' '}
      {roles.analysts.length > 1 ? 'Analysts' : 'Analyst'}: <strong>{analysts}</strong>, Envoy:{' '}
      <strong>{roles.envoy}</strong>
    </p>
  );
}
