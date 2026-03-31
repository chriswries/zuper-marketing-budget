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

interface TransactionRow {
  fiscal_year_id: string
  txn_id: string
  txn_date: string | null
  merchant: string | null
  amount: number
  source: string | null
  raw: Record<string, unknown>
  canonical_vendor_id: string | null
}

interface ReplaceActualsRequest {
  fiscalYearId: string
  transactions: TransactionRow[]
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

    // Check caller is admin or finance
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileError || !profile || !['admin', 'finance'].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: 'Admin or Finance role required' }),
        { status: 403, headers: jsonHeaders }
      )
    }

    // Parse and validate body
    const body: ReplaceActualsRequest = await req.json()
    const { fiscalYearId, transactions } = body

    if (!fiscalYearId || typeof fiscalYearId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid fiscalYearId' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    if (!Array.isArray(transactions)) {
      return new Response(
        JSON.stringify({ error: 'transactions must be an array' }),
        { status: 400, headers: jsonHeaders }
      )
    }

    // Execute transactional replace using raw SQL via service role
    // Build parameterized insert values
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')!

    // Use pg transaction via fetch to PostgREST won't work for transactions,
    // so we use the supabase-js rpc approach with a db function.
    // Actually, simplest: delete + insert via service role client in sequence,
    // but wrap in a Postgres function for atomicity.
    // 
    // Alternative approach: use service role client but leverage PostgreSQL's
    // transactional behavior through a database function.
    // For simplicity and reliability, we'll create inline SQL via rpc.
    //
    // Best approach: Use the service role client. Since PostgREST doesn't support
    // multi-statement transactions, we'll use a two-step approach with error handling:
    // 1. Delete existing rows
    // 2. Insert new rows
    // If insert fails, we return error (data is already deleted).
    // To make it truly atomic, we execute raw SQL.

    // Use Deno's postgres driver for true transaction support
    const { default: postgres } = await import('https://deno.land/x/postgresjs@v3.4.5/mod.js')
    const sql = postgres(dbUrl)

    try {
      await sql.begin(async (tx: any) => {
        // Delete existing
        await tx`DELETE FROM actuals_transactions WHERE fiscal_year_id = ${fiscalYearId}`

        // Insert new if any
        if (transactions.length > 0) {
          // Insert in batches of 500 to avoid query size limits
          const batchSize = 500
          for (let i = 0; i < transactions.length; i += batchSize) {
            const batch = transactions.slice(i, i + batchSize)
            const values = batch.map((t: TransactionRow) => ({
              fiscal_year_id: fiscalYearId,
              txn_id: t.txn_id,
              txn_date: t.txn_date,
              merchant: t.merchant,
              amount: t.amount,
              source: t.source,
              raw: JSON.stringify(t.raw),
              canonical_vendor_id: t.canonical_vendor_id,
            }))

            await tx`INSERT INTO actuals_transactions ${tx(values)}`
          }
        }
      })

      await sql.end()

      console.log(`Replaced actuals for FY ${fiscalYearId}: ${transactions.length} transactions by ${caller.email}`)

      return new Response(
        JSON.stringify({ success: true, count: transactions.length }),
        { status: 200, headers: jsonHeaders }
      )
    } catch (dbError) {
      await sql.end().catch(() => {})
      console.error('Transaction failed (rolled back):', dbError)
      return new Response(
        JSON.stringify({ error: 'Transaction failed, no data was modified', details: String(dbError) }),
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
