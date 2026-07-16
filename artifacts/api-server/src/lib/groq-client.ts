import Groq from "groq-sdk";
import { logger } from "./logger";

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is required");
  }
  return new Groq({ apiKey });
}

export interface FileChange {
  path: string;
  content: string | null;
  action: "create" | "modify" | "delete";
}

export interface AiCodeResult {
  summary: string;
  fileChanges: FileChange[];
}

const THINKING_PROMPT = `You are a senior software engineer. A developer has given you a coding task.
Briefly describe your plan in 2–3 sentences — what you will create or change and why.
Be direct and technical. Do not write code yet, just your plan.`;

const SYSTEM_PROMPT = `You are CodeVault, an expert AI software engineer embedded in a developer tool. You help users build, refactor, and improve their codebases.

When given a task:
1. Analyze the repository structure and relevant files
2. Determine the minimal, correct set of file changes needed
3. Return ONLY valid JSON — no markdown, no explanation outside the JSON

Always respond with this exact JSON structure:
{
  "summary": "One sentence describing what was done",
  "fileChanges": [
    {
      "path": "relative/path/to/file.ext",
      "action": "create" | "modify" | "delete",
      "content": "complete file content as a string (null for delete)"
    }
  ]
}

Rules:
- ALWAYS produce at least one file change. Never return an empty fileChanges array.
- If the workspace is empty or only has a README, create the necessary files from scratch to fulfil the request.
- If the task is ambiguous, make a reasonable interpretation and implement it — do not refuse.
- For create/modify, always provide the COMPLETE file content (not just the diff)
- For delete, set content to null
- Use correct file extensions and proper formatting
- Respect the existing code architecture and style
- Prefer minimal, focused changes over large rewrites
- Never include binary files or lock files in fileChanges`;

/**
 * Streams the AI's thinking/reasoning as text chunks.
 * Calls onChunk for each streamed token.
 */
export async function streamThinking(
  prompt: string,
  fileTree: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const groq = getGroqClient();

  const userMessage = `Repository structure:\n\`\`\`\n${fileTree || "(empty)"}\n\`\`\`\n\nTask: ${prompt}`;

  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: THINKING_PROMPT },
      { role: "user", content: userMessage },
    ],
    stream: true,
    temperature: 0.4,
    max_tokens: 200,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) onChunk(delta);
  }
}

export async function generateCodeChanges(
  prompt: string,
  fileTree: string,
  contextFiles: { path: string; content: string }[],
): Promise<AiCodeResult> {
  const groq = getGroqClient();

  const contextSection =
    contextFiles.length > 0
      ? contextFiles
          .map((f) => `\`\`\`${f.path}\n${f.content}\n\`\`\``)
          .join("\n\n")
      : "No files provided for context.";

  const userMessage = `Repository structure:
\`\`\`
${fileTree || "(empty — create all files from scratch)"}
\`\`\`

Current file contents:
${contextSection}

Task: ${prompt}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Partial<AiCodeResult>;

    return {
      summary: parsed.summary ?? "Changes applied",
      fileChanges: (parsed.fileChanges ?? []).map((fc) => ({
        path: fc.path ?? "",
        content: fc.content ?? null,
        action: (fc.action as "create" | "modify" | "delete") ?? "modify",
      })),
    };
  } catch (err) {
    logger.error({ err }, "Groq API error");
    throw new Error("AI code generation failed");
  }
}

export async function generateCommitMessage(
  diffs: { path: string; status: string }[],
  userHint?: string,
): Promise<string> {
  const groq = getGroqClient();

  const diffSummary = diffs
    .map((d) => `${d.status}: ${d.path}`)
    .join("\n");

  const prompt = userHint
    ? `Generate a concise, conventional-commits style commit message for these changes:\n${diffSummary}\nHint from user: ${userHint}`
    : `Generate a concise, conventional-commits style commit message for these changes:\n${diffSummary}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that writes concise, descriptive git commit messages following conventional commits format. Return ONLY the commit message, nothing else.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    return (
      response.choices[0]?.message?.content?.trim() ?? "feat: apply changes"
    );
  } catch {
    return "feat: apply AI-generated changes";
  }
}
