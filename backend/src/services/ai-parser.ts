import Anthropic from '@anthropic-ai/sdk';
import type { ParsedItem } from './pdf-parser.js';

const SYSTEM_PROMPT = `Jsi parser T-Mobile faktur. Z textu faktury extrahuj seznam telefonních čísel/služeb s částkami.

Pro každou položku vrať:
- phoneNumber: ID čísla/služby (9-ti místné číslo, DSL..., LIC..., TV...)
- serviceName: název služby
- amountNoDph: částka za služby bez DPH
- amountNonDph: částka za položky nepodléhající DPH (SMS platby apod.), 0 pokud není
- amountWithDph: celková částka včetně DPH

Vrať POUZE validní JSON pole, žádný jiný text.`;

export async function aiParsePDF(rawText: string): Promise<{ items: ParsedItem[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { items: [] };
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Parsuj tuto T-Mobile fakturu a vrať JSON pole položek:\n\n${rawText.substring(0, 15000)}`
    }]
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return { items: [] };
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParsedItem[];
  return { items: parsed };
}
