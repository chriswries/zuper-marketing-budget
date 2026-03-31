/**
 * migrate_requests_data
 *
 * One-time idempotent migration: reads spend_requests.data JSONB and populates
 * the new relational columns + request_approval_steps rows.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin") || "";
  const siteUrl = Deno.env.get("SITE_URL") || "";
  const allowed = [siteUrl, "http://localhost:5173"].filter(Boolean);
  return allowed.includes(origin) ? origin : allowed[0] || "*";
}

function getCorsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", (await userClient.auth.getUser()).data.user?.id ?? "")
      .single();

    if (profileError || profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Use service role for migration
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all spend_requests
    const { data: requests, error: fetchErr } = await adminClient
      .from("spend_requests")
      .select("*");

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let requestsUpdated = 0;
    let stepsInserted = 0;
    const errors: string[] = [];

    for (const row of requests || []) {
      const data = row.data as Record<string, unknown>;
      if (!data) continue;

      // Update relational columns (only if not already populated)
      try {
        const { error: updateErr } = await adminClient
          .from("spend_requests")
          .update({
            cost_center_id: row.cost_center_id ?? (data.costCenterId as string) ?? null,
            cost_center_name: row.cost_center_name ?? (data.costCenterName as string) ?? null,
            vendor_name: row.vendor_name ?? (data.vendorName as string) ?? null,
            amount: row.amount ?? (data.amount as number) ?? null,
            start_month: row.start_month ?? (data.startMonth as string) ?? null,
            end_month: row.end_month ?? (data.endMonth as string) ?? null,
            is_contracted: row.is_contracted ?? (data.isContracted as boolean) ?? false,
            justification: row.justification ?? (data.justification as string) ?? null,
            requester_id: row.requester_id ?? (data.requesterId as string) ?? null,
            origin_sheet: row.origin_sheet ?? (data.originSheet as string) ?? null,
            origin_cost_center_id: row.origin_cost_center_id ?? (data.originCostCenterId as string) ?? null,
            origin_line_item_id: row.origin_line_item_id ?? (data.originLineItemId as string) ?? null,
            origin_kind: row.origin_kind ?? (data.originKind as string) ?? null,
            line_item_name: row.line_item_name ?? (data.lineItemName as string) ?? null,
            target_request_id: row.target_request_id ?? (data.targetRequestId as string) ?? null,
            current_amount: row.current_amount ?? (data.currentAmount as number) ?? null,
            revised_amount: row.revised_amount ?? (data.revisedAmount as number) ?? null,
          })
          .eq("id", row.id);

        if (updateErr) {
          errors.push(`Update ${row.id}: ${updateErr.message}`);
        } else {
          requestsUpdated++;
        }
      } catch (e) {
        errors.push(`Update ${row.id}: ${String(e)}`);
      }

      // Insert approval steps
      const approvalSteps = data.approvalSteps as Array<{
        level: string;
        status: string;
        updatedAt?: string;
        comment?: string;
      }> | undefined;

      if (approvalSteps && Array.isArray(approvalSteps)) {
        for (let i = 0; i < approvalSteps.length; i++) {
          const step = approvalSteps[i];
          try {
            const { error: stepErr } = await adminClient
              .from("request_approval_steps")
              .upsert(
                {
                  request_id: row.id,
                  level: step.level,
                  status: step.status,
                  updated_at: step.updatedAt ?? null,
                  comment: step.comment ?? null,
                  step_order: i,
                },
                { onConflict: "request_id,step_order" }
              );

            if (stepErr) {
              errors.push(`Step ${row.id}[${i}]: ${stepErr.message}`);
            } else {
              stepsInserted++;
            }
          } catch (e) {
            errors.push(`Step ${row.id}[${i}]: ${String(e)}`);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        requestsProcessed: (requests || []).length,
        requestsUpdated,
        stepsInserted,
        errors,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
