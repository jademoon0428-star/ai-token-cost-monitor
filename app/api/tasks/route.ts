import { NextResponse } from "next/server";

import {
  getActiveSession,
  getTask,
  getTaskUsageBundles,
  listTaskHistory,
} from "@/lib/repositories/task-repository";
import {
  abandonTaskSession,
  associateUsageRecord,
  completeTaskSession,
  createTask,
  getTaskSessionVerifiedCost,
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
    case "USAGE_ALREADY_ATTRIBUTED":
      return 409;

    case "TASK_NOT_FOUND":
    case "SESSION_NOT_FOUND":
    case "USAGE_NOT_FOUND":
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

    /*
     * Recomputed on every read, never persisted. The count is scoped
     * to the active session so it reports what this run of work has
     * attributed so far, and the cost is null whenever the all-or-
     * nothing reliability rule does not hold, which the Dashboard
     * renders as "unavailable" rather than zero.
     */
    const active = activeSession
      ? {
          task: getTask(activeSession.task_id) ?? null,
          session: activeSession,
          usage: {
            attributed_count: getTaskUsageBundles(
              activeSession.task_id
            ).filter(
              (bundle) =>
                bundle.task_session_id ===
                activeSession.id
            ).length,
            verified_cost:
              getTaskSessionVerifiedCost(
                activeSession.id
              ),
          },
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

    if (action === "usage/attach") {
      const usageRecordId =
        typeof body.usage_record_id === "string"
          ? body.usage_record_id.trim()
          : "";

      if (!usageRecordId) {
        return NextResponse.json(
          {
            error:
              "usage_record_id must be a non-empty string.",
          },
          { status: 400 }
        );
      }

      /*
       * Only one task session can be active at a time, so the target
       * is resolved server-side. The client cannot pick a task or a
       * session, and therefore cannot steer the attribution.
       */
      const session =
        getActiveSession();

      if (!session) {
        return NextResponse.json(
          {
            error:
              "No active session to attach usage to.",
          },
          { status: 400 }
        );
      }

      const { inserted } =
        associateUsageRecord({
          taskId: session.task_id,
          usageRecordId,
          sessionId: session.id,
        });

      return NextResponse.json({
        ok: true,
        inserted,
        task_id: session.task_id,
        task_session_id: session.id,
        usage_record_id: usageRecordId,
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