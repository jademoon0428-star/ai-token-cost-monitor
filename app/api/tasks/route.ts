import { NextResponse } from "next/server";

import {
  getActiveSession,
  getTask,
  listTaskHistory,
} from "@/lib/repositories/task-repository";
import {
  abandonTaskSession,
  completeTaskSession,
  createTask,
  startTaskSession,
  TaskServiceError,
} from "@/lib/services/task-service";

export const runtime = "nodejs";

function taskErrorStatus(
  error: TaskServiceError
): number {
  switch (error.code) {
    case "ACTIVE_SESSION_EXISTS":
    case "SESSION_NOT_ACTIVE":
    case "SESSION_TASK_MISMATCH":
      return 409;

    case "TASK_NOT_FOUND":
    case "SESSION_NOT_FOUND":
      return 404;

    case "INVALID_TASK_NAME":
    case "NO_ACTIVE_SESSION":
    default:
      return 400;
  }
}

export async function GET() {
  try {
    const activeSession = getActiveSession();

    const active = activeSession
      ? {
          task: getTask(activeSession.task_id) ?? null,
          session: activeSession,
        }
      : null;

    return NextResponse.json({
      success: true,
      active,
      history: listTaskHistory(),
    });
  } catch (error) {
    console.error(
      "[Tasks API] Failed to load task state:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load task state.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
) {
  let body: Record<string, unknown>;

  try {
    body =
      (await request.json()) as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        error:
          "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  const action =
    typeof body.action === "string"
      ? body.action
      : "";

  try {
    if (action === "create/start") {
      const name =
        typeof body.name === "string"
          ? body.name.trim()
          : "";

      if (!name) {
        return NextResponse.json(
          {
            error:
              "name must be a non-empty string.",
          },
          { status: 400 }
        );
      }

      const task = createTask({ name });
      const session = startTaskSession({
        taskId: task.id,
      });

      return NextResponse.json({
        ok: true,
        task_id: task.id,
        session_id: session.id,
      });
    }

    if (
      action === "stop/complete" ||
      action === "stop/abandon"
    ) {
      const sessionId =
        typeof body.session_id ===
          "string"
          ? body.session_id
          : getActiveSession()?.id ?? null;

      if (!sessionId) {
        return NextResponse.json(
          {
            error:
              "No active session to stop.",
          },
          { status: 400 }
        );
      }

      const ended =
        action === "stop/complete"
          ? completeTaskSession({ sessionId })
          : abandonTaskSession({ sessionId });

      return NextResponse.json({
        ok: true,
        session_id: ended.id,
        status: ended.status,
      });
    }

    return NextResponse.json(
      {
        error: "Unknown task action.",
      },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof TaskServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: taskErrorStatus(error) }
      );
    }

    console.error(
      "[Tasks API] Task action failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Task action failed.",
      },
      { status: 500 }
    );
  }
}