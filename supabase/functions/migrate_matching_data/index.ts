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

interface MatchEntry {
  costCenterId: string
  lineItemId: string
  matchSource?: string
  matchedAt?: string
  matchedByRole?: string
  merchantKey?: string
}

interface RuleEntry {
  costCenterId: string
  lineItemId: string
  createdByRole?: string
}

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
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: jsonHeaders }
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: jsonHeaders }
      )
    }

    // Check caller is admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin role required' }),
        { status: 403, headers: jsonHeaders }
      )
    }

    // Fetch all actuals_matching rows
    const { data: matchingRows, error: fetchError } = await adminClient
      .from('actuals_matching')
      .select('fiscal_year_id, matches_by_txn_id, rules_by_merchant_key')

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch actuals_matching', details: fetchError.message }),
        { status: 500, headers: jsonHeaders }
      )
    }

    if (!matchingRows || matchingRows.length === 0) {
      return new Response(
        JSON.stringify({ fiscalYearsProcessed: 0, matchesMigrated: 0, rulesMigrated: 0, errors: [] }),
        { status: 200, headers: jsonHeaders }
      )
    }

    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js')
    const sql = postgres(dbUrl)

    let totalMatches = 0
    let totalRules = 0
    const errors: string[] = []

    try {
      for (const row of matchingRows) {
        const fyId = row.fiscal_year_id
        const matchesObj = (row.matches_by_txn_id || {}) as Record<string, MatchEntry>
        const rulesObj = (row.rules_by_merchant_key || {}) as Record<string, RuleEntry>

        // Migrate matches
        const matchEntries = Object.entries(matchesObj)
        if (matchEntries.length > 0) {
          const batchSize = 500
          for (let i = 0; i < matchEntries.length; i += batchSize) {
            const batch = matchEntries.slice(i, i + batchSize)
            const values = batch.map(([txnId, match]) => ({
              fiscal_year_id: fyId,
              txn_id: txnId,
              cost_center_id: match.costCenterId,
              line_item_id: match.lineItemId,
              match_source: match.matchSource || 'manual',
              matched_at: match.matchedAt || new Date().toISOString(),
              matched_by_role: match.matchedByRole || 'admin',
              merchant_key: match.merchantKey || null,
            }))

            try {
              await sql`INSERT INTO actuals_matches ${sql(values)} ON CONFLICT (fiscal_year_id, txn_id) DO NOTHING`
              totalMatches += batch.length
            } catch (e) {
              errors.push(`FY ${fyId} matches batch ${i}: ${String(e)}`)
            }
          }
        }

        // Migrate rules
        const ruleEntries = Object.entries(rulesObj)
        if (ruleEntries.length > 0) {
          const batchSize = 500
          for (let i = 0; i < ruleEntries.length; i += batchSize) {
            const batch = ruleEntries.slice(i, i + batchSize)
            const values = batch.map(([merchantKey, rule]) => ({
              fiscal_year_id: fyId,
              merchant_key: merchantKey,
              cost_center_id: rule.costCenterId,
              line_item_id: rule.lineItemId,
              created_by_role: rule.createdByRole || 'admin',
            }))

            try {
              await sql`INSERT INTO merchant_rules ${sql(values)} ON CONFLICT (fiscal_year_id, merchant_key) DO NOTHING`
              totalRules += batch.length
            } catch (e) {
              errors.push(`FY ${fyId} rules batch ${i}: ${String(e)}`)
            }
          }
        }
      }

      await sql.end()

      console.log(`Migration complete: ${matchingRows.length} FYs, ${totalMatches} matches, ${totalRules} rules by ${caller.email}`)

      return new Response(
        JSON.stringify({
          fiscalYearsProcessed: matchingRows.length,
          matchesMigrated: totalMatches,
          rulesMigrated: totalRules,
          errors,
        }),
        { status: 200, headers: jsonHeaders }
      )
    } catch (dbError) {
      await sql.end().catch(() => {})
      console.error('Migration failed:', dbError)
      return new Response(
        JSON.stringify({ error: 'Migration failed', details: String(dbError) }),
        { status: 500, headers: jsonHeaders }
      )
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: getCorsHeaders(req) }
    )
  }
})
