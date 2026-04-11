import { createHash } from 'crypto';

export function hashTemplate(template: string): string {
  return createHash('sha256').update(template).digest('hex').slice(0, 16);
}

export function renderTemplate(
  template: string,
  variables: Record<string, string | boolean | undefined>
): string {
  let result = template;
  const fieldMap: Record<string, string> = {
    '1': 'name',
    '2': 'governorate',
    '3': 'category',
    '4': 'phone'
  };
  for (const [num, field] of Object.entries(fieldMap)) {
    const rawValue = variables[field];
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    result = result.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), value);
  }
  const namedFields = ['name', 'governorate', 'category', 'phone'];
  for (const field of namedFields) {
    const rawValue = variables[field];
    const value = rawValue === undefined || rawValue === null ? '' : String(rawValue);
    result = result.replace(new RegExp(`\\{\\{${field}\\}\\}`, 'g'), value);
  }
  return result;
}
