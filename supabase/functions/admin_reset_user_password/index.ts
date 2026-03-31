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

interface ResetPasswordRequest {
  userId: string
  tempPassword: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: ResetPasswordRequest = await req.json()
    const { userId, tempPassword } = body

    // Validate inputs
    if (!userId || !tempPassword) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update auth user password using admin API
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password: tempPassword }
    )

    if (updateAuthError) {
      console.error('Update password error:', updateAuthError)
      return new Response(
        JSON.stringify({ error: updateAuthError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update profile to force password change
    const { error: updateProfileError } = await adminClient
      .from('profiles')
      .update({
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateProfileError) {
      console.error('Update profile error:', updateProfileError)
      // Password was reset but profile update failed - still return success
      console.warn('Profile update failed, but password was reset')
    }

    console.log(`Password reset for user ${userId} by admin ${caller.email}`)

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
