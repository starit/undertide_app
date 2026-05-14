import { createThemed } from "@themed.js/core";
import { NextResponse } from "next/server";
import {
  consumeThemeGenerateRateSlot,
  getClientIpFromRequest,
  getThemeGenerateMinIntervalMs,
} from "@/lib/theme-generate-rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PROMPT_LENGTH = 800;

export async function GET() {
  const configured = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  return NextResponse.json({ data: { configured } });
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Theme AI is not configured (missing DEEPSEEK_API_KEY)." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt =
    typeof body === "object" && body !== null && "prompt" in body && typeof (body as { prompt: unknown }).prompt === "string"
      ? (body as { prompt: string }).prompt.trim()
      : "";

  if (!prompt) {
    return NextResponse.json({ error: "Missing or empty prompt." }, { status: 400 });
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json({ error: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters.` }, { status: 400 });
  }

  const minIntervalMs = getThemeGenerateMinIntervalMs();
  const clientIp = getClientIpFromRequest(request);
  const slot = consumeThemeGenerateRateSlot(clientIp, minIntervalMs);
  if (!slot.ok) {
    return NextResponse.json(
      { error: "Too many theme requests from this address. Please wait and try again.", retryAfterSec: slot.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(slot.retryAfterSec) } }
    );
  }

  const themed = createThemed({
    ai: {
      provider: "deepseek",
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL,
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
    },
    storage: { type: "none", autoSave: false, autoLoad: false },
  });

  try {
    await themed.init();
    const theme = await themed.generate(prompt, { autoApply: false, autoSave: false });
    try {
      const ua = request.headers.get("user-agent");
      console.info(
        "[theme_generate]",
        JSON.stringify({
          kind: "success",
          at: new Date().toISOString(),
          prompt,
          clientIp,
          userAgent: ua ? ua.slice(0, 320) : null,
          theme: JSON.parse(JSON.stringify(theme)) as Record<string, unknown>,
        })
      );
    } catch (logErr) {
      console.warn("[theme_generate] log serialization failed", logErr);
    }
    return NextResponse.json({ data: theme });
  } catch (e) {
    console.error("[api/themes/generate]", e);
    return NextResponse.json(
      { error: "Theme generation failed. Please try again in a moment." },
      { status: 502 }
    );
  } finally {
    themed.destroy();
  }
}
