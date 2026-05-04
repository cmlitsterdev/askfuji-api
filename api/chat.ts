import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { MANUAL, NFG } from './manuals';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CAMERAS: Record<string, { name: string; systemPrompt: string }> = {
  'fuji-x100vi': {
    name: 'Fuji X100VI',
    systemPrompt: `You are AskFuji, an expert assistant for the Fuji X100VI camera.
You have been provided with the full Owner's Manual and New Features Guide for the X100VI.
Answer questions clearly and concisely using the manuals as your primary source.
When relevant, mention specific menu locations (e.g. "Shooting Settings > AF Mode").
Keep responses focused — the user is likely holding their camera.

--- OWNER'S MANUAL ---
${MANUAL}

--- NEW FEATURES GUIDE ---
${NFG}`,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cameraId, messages } = req.body;

  if (!cameraId || !messages) {
    return res.status(400).json({ error: 'Missing cameraId or messages' });
  }

  const camera = CAMERAS[cameraId];
  if (!camera) {
    return res.status(404).json({ error: `Unknown camera: ${cameraId}` });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: camera.systemPrompt,
      messages: (messages as { role: string; text: string }[]).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
      })),
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : 'No response.';
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Claude error:', error);
    return res.status(500).json({ error: 'Failed to get response from Claude' });
  }
}
