import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Camera configs — add new cameras here
const CAMERAS: Record<string, { name: string; fileIds: string[]; systemPrompt: string }> = {
  'fuji-x100vi': {
    name: 'Fuji X100VI',
    fileIds: [
      process.env.FUJI_X100VI_MANUAL_FILE_ID!,
      process.env.FUJI_X100VI_NFG_FILE_ID!,
    ],
    systemPrompt: `You are AskFuji, an expert assistant for the Fuji X100VI camera.
You have been provided with the full Owner's Manual and New Features Guide for the X100VI.
Answer questions clearly and concisely using the manuals as your primary source.
When relevant, mention specific menu locations (e.g. "Shooting Settings > AF Mode").
Keep responses focused — the user is likely holding their camera.`,
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
    const firstUserContent = [
      ...camera.fileIds.filter(Boolean).map((fileId) => ({
        type: 'document' as const,
        source: { type: 'file' as const, file_id: fileId },
      })),
      { type: 'text' as const, text: messages[0].text },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any[];

    const formattedMessages = messages.map(
      (m: { role: string; text: string }, i: number) => ({
        role: m.role as 'user' | 'assistant',
        content: i === 0 ? firstUserContent : m.text,
      })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];

    const response = await client.beta.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: camera.systemPrompt,
      messages: formattedMessages,
      betas: ['files-api-2025-04-14'],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : 'No response.';
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Claude error:', error);
    return res.status(500).json({ error: 'Failed to get response from Claude' });
  }
}
