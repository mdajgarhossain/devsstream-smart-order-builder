import type { Group } from '../../domain/types';

/** Short limit hint for a group header, built only from the group's data. e.g. "2-6, in steps of 2" */
export function describeGroup(group: Group): string {
  const min = group.min ?? 0;
  const parts: string[] = [];

  if (group.max !== undefined) {
    if (min === group.max) parts.push(`Pick ${min}`);
    else if (min === 0) parts.push(`Up to ${group.max}`);
    else parts.push(`${min}-${group.max}`);
  } else {
    parts.push(min > 0 ? `At least ${min}` : 'Optional');
  }
  if (group.step) parts.push(`in steps of ${group.step}`);
  if (group.maxDistinct !== undefined) parts.push(`up to ${group.maxDistinct} kinds`);
  if (group.maxPerOption !== undefined) parts.push(`max ${group.maxPerOption} each`);

  return parts.join(', ');
}
