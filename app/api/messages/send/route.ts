import { NextRequest, NextResponse } from "next/server";
import { requireClient } from "@/lib/whatsapp/guard";
import { normalizeNumber } from "@/lib/whatsapp/normalizeNumber";
import { resolveChatId } from "@/lib/whatsapp/resolveChatId";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { number?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const { number, message } = body;
  if (!number || typeof message !== "string" || message.trim() === "") {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Both `number` and `message` are required." },
      { status: 400 },
    );
  }

  // Cheap format check before we spin up the session guard.
  if (!normalizeNumber(number)) {
    return NextResponse.json(
      {
        error: "INVALID_NUMBER",
        message:
          "Number is not valid. Use a full international number including country code.",
      },
      { status: 400 },
    );
  }

  const guard = await requireClient();
  if (!guard.ok) return guard.response;

  const resolved = await resolveChatId(guard.client, number);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.reason, message: resolved.message },
      { status: 400 },
    );
  }

  try {
    const sent = await guard.client.sendMessage(resolved.chatId, message);
    return NextResponse.json({ ok: true, id: sent.id?._serialized ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: "SEND_FAILED", message: (err as Error).message },
      { status: 500 },
    );
  }
}
