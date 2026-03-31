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

interface CreateUserRequest {
  email: string
  tempPassword: string
  firstName: string
  lastName: string
  role: 'admin' | 'manager' | 'cmo' | 'finance'
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Create admin client with service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Create user client to verify caller
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get caller user
    const { data: { user: caller }, error: callerError } = await userClient.auth.getUser()
    if (callerError || !caller) {
      console.error('Caller auth error:', callerError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Check if caller is admin
    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin') {
      console.error('Admin check failed:', profileError)
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: CreateUserRequest = await req.json()
    const { email, tempPassword, firstName, lastName, role } = body

    // Validate inputs
    if (!email || !tempPassword || !role) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const validRoles = ['admin', 'manager', 'cmo', 'finance']
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Create auth user using admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm for admin provisioning
    })

    if (createError) {
      console.error('Create user error:', createError)
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const userId = newUser.user.id

    // Poll for profile created by handle_new_user trigger, then update it
    const MAX_RETRIES = 10
    const RETRY_DELAY = 200
    let profileFound = false

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (existingProfile) {
        console.log(`Profile found on attempt ${attempt}`)
        const { error: updateError } = await adminClient
          .from('profiles')
          .update({
            first_name: firstName || null,
            last_name: lastName || null,
            role: role,
            must_change_password: true,
            is_active: true,
            invited_at: new Date().toISOString(),
            invited_by: caller.id,
          })
          .eq('id', userId)

        if (updateError) {
          console.error('Update profile error:', updateError)
        }
        profileFound = true
        break
      }

      console.log(`Profile not found, retry ${attempt}/${MAX_RETRIES}`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
    }

    // Fallback: create profile directly if trigger never ran
    if (!profileFound) {
      console.warn('Trigger did not create profile, inserting directly')
      const { error: insertError } = await adminClient
        .from('profiles')
        .insert({
          id: userId,
          email: email,
          first_name: firstName || null,
          last_name: lastName || null,
          role: role,
          must_change_password: true,
          is_active: true,
          invited_at: new Date().toISOString(),
          invited_by: caller.id,
        })

      if (insertError) {
        console.error('Fallback profile insert error:', insertError)
      }
    }

    console.log(`User ${email} created successfully by admin ${caller.email}`)

    return new Response(
      JSON.stringify({ userId, email }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
