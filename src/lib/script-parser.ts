import { ScriptLine } from '@/types';

export function parseScriptText(text: string): { lines: ScriptLine[]; roles: string[] } {
  const lines: ScriptLine[] = [];
  const roleSet = new Set<string>();

  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const rawLine of rawLines) {
    // Match "角色名：台词" or "角色名:台词"
    const match = rawLine.match(/^(.+?)[：:]\s*(.+)$/);
    if (match) {
      const role = match[1].trim();
      const content = match[2].trim();
      lines.push({ role, content });
      roleSet.add(role);
    }
  }

  return {
    lines,
    roles: Array.from(roleSet),
  };
}

export function scriptLinesToString(lines: ScriptLine[]): string {
  return lines.map((l) => `${l.role}：${l.content}`).join('\n');
}
