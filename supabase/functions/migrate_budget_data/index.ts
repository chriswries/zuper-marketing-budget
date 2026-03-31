import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getAllowedOrigin(req: Request): string {
  const allowlist = [
    Deno.env.get('SITE_URL') || '',
    'http://localhost:5173',
  ].filter(Boolean)
  const origin = req.headers.get('Origin') || ''
  return allowlist.includes(origin) ? origin : allowlist[0] || 'https://zuper-budget.lovable.app'
}

function getCorsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const MONTHS = ['feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec','jan']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: jsonHeaders })
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile } = await adminClient.from('profiles').select('role').eq('id', caller.id).single()
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: jsonHeaders })
    }

    // Fetch all fiscal years and forecasts
    const [fyRes, forecastRes] = await Promise.all([
      adminClient.from('fiscal_years').select('id, data'),
      adminClient.from('fy_forecasts').select('fiscal_year_id, data'),
    ])

    if (fyRes.error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch fiscal_years', details: fyRes.error.message }), { status: 500, headers: jsonHeaders })
    }

    const fiscalYears = fyRes.data ?? []
    const forecastsByFy: Record<string, any> = {}
    for (const f of forecastRes.data ?? []) {
      forecastsByFy[f.fiscal_year_id] = f.data
    }

    if (fiscalYears.length === 0) {
      return new Response(JSON.stringify({ fiscalYearsProcessed: 0, costCentersMigrated: 0, lineItemsMigrated: 0, monthlyValuesMigrated: 0, errors: [] }), { status: 200, headers: jsonHeaders })
    }

    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js')
    const sql = postgres(dbUrl)

    let totalCostCenters = 0
    let totalLineItems = 0
    let totalMonthlyValues = 0
    const errors: string[] = []

    try {
      for (const fy of fiscalYears) {
        const fyId = fy.id
        const data = fy.data as any
        if (!data) continue

        try {
          // 1. Update fiscal_years columns
          const approval = data.approval || {}
          await sql`
            UPDATE fiscal_years SET
              year = ${data.year ?? null},
              start_date = ${data.startDate ?? null},
              end_date = ${data.endDate ?? null},
              target_budget = ${data.targetBudget ?? 0},
              approval_status = ${approval.status ?? 'draft'},
              approval_submitted_at = ${approval.submittedAt ?? null},
              approval_approved_at = ${approval.approvedAt ?? null},
              approval_rejected_at = ${approval.rejectedAt ?? null}
            WHERE id = ${fyId}
          `

          // 2. Insert approval steps
          const steps = approval.steps || []
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            await sql`
              INSERT INTO budget_approval_steps (fiscal_year_id, level, status, updated_at, step_order)
              VALUES (${fyId}, ${step.level}, ${step.status ?? 'pending'}, ${step.updatedAt ?? null}, ${i + 1})
              ON CONFLICT (fiscal_year_id, level) DO NOTHING
            `
          }

          // 3. Insert cost centers and line items from budget data
          const costCenters = data.costCenters || []
          for (const cc of costCenters) {
            await sql`
              INSERT INTO cost_centers (id, fiscal_year_id, name, owner_id, annual_limit)
              VALUES (${cc.id}, ${fyId}, ${cc.name}, ${cc.ownerId ?? null}, ${cc.annualLimit ?? 0})
              ON CONFLICT (id) DO NOTHING
            `
            totalCostCenters++

            const lineItems = cc.lineItems || []
            for (const li of lineItems) {
              await sql`
                INSERT INTO line_items (
                  id, cost_center_id, fiscal_year_id, name, vendor_id, vendor_name,
                  owner_id, is_contracted, is_accrual, is_software_subscription,
                  contract_start_date, contract_end_date, auto_renew, cancellation_notice_days,
                  approval_status, approval_request_id,
                  adjustment_status, adjustment_request_id, adjustment_before_values, adjustment_sheet,
                  deletion_status, deletion_request_id,
                  cancellation_status, cancellation_request_id
                ) VALUES (
                  ${li.id}, ${cc.id}, ${fyId}, ${li.name},
                  ${li.vendor?.id ?? null}, ${li.vendor?.name ?? null},
                  ${li.ownerId ?? null},
                  ${li.isContracted ?? false}, ${li.isAccrual ?? false}, ${li.isSoftwareSubscription ?? false},
                  ${li.contractStartDate ?? null}, ${li.contractEndDate ?? null},
                  ${li.autoRenew ?? null}, ${li.cancellationNoticeDays ?? null},
                  ${li.approvalStatus ?? null}, ${li.approvalRequestId ?? null},
                  ${li.adjustmentStatus ?? null}, ${li.adjustmentRequestId ?? null},
                  ${li.adjustmentBeforeValues ? JSON.stringify(li.adjustmentBeforeValues) : null},
                  ${li.adjustmentSheet ?? null},
                  ${li.deletionStatus ?? null}, ${li.deletionRequestId ?? null},
                  ${li.cancellationStatus ?? null}, ${li.cancellationRequestId ?? null}
                )
                ON CONFLICT (id) DO NOTHING
              `
              totalLineItems++

              // 4. Insert budget monthly values
              const budgetValues = li.budgetValues || {}
              for (const month of MONTHS) {
                const amount = budgetValues[month] ?? 0
                await sql`
                  INSERT INTO monthly_values (line_item_id, fiscal_year_id, value_type, month, amount)
                  VALUES (${li.id}, ${fyId}, 'budget', ${month}, ${amount})
                  ON CONFLICT (line_item_id, value_type, month) DO NOTHING
                `
                totalMonthlyValues++
              }
            }
          }

          // 5. Insert forecast monthly values from fy_forecasts
          const forecastData = forecastsByFy[fyId]
          if (forecastData) {
            const fCostCenters = (forecastData as any).costCenters || (Array.isArray(forecastData) ? forecastData : [])
            for (const fcc of fCostCenters) {
              const fLineItems = fcc.lineItems || []
              for (const fli of fLineItems) {
                const forecastValues = fli.forecastValues || fli.budgetValues || {}
                for (const month of MONTHS) {
                  const amount = forecastValues[month] ?? 0
                  await sql`
                    INSERT INTO monthly_values (line_item_id, fiscal_year_id, value_type, month, amount)
                    VALUES (${fli.id}, ${fyId}, 'forecast', ${month}, ${amount})
                    ON CONFLICT (line_item_id, value_type, month) DO NOTHING
                  `
                  totalMonthlyValues++
                }
              }
            }
          }
        } catch (fyError) {
          errors.push(`FY ${fyId}: ${String(fyError)}`)
        }
      }

      await sql.end()

      console.log(`Budget migration complete: ${fiscalYears.length} FYs, ${totalCostCenters} CCs, ${totalLineItems} LIs, ${totalMonthlyValues} MVs by ${caller.email}`)

      return new Response(JSON.stringify({
        fiscalYearsProcessed: fiscalYears.length,
        costCentersMigrated: totalCostCenters,
        lineItemsMigrated: totalLineItems,
        monthlyValuesMigrated: totalMonthlyValues,
        errors,
      }), { status: 200, headers: jsonHeaders })
    } catch (dbError) {
      await sql.end().catch(() => {})
      console.error('Migration failed:', dbError)
      return new Response(JSON.stringify({ error: 'Migration failed', details: String(dbError) }), { status: 500, headers: jsonHeaders })
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: getCorsHeaders(req) })
  }
})
