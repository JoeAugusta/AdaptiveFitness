import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { User } from 'https://esm.sh/@supabase/supabase-js@2';

export type AuthSuccess = { user: User | null };
export type AuthFailure = { errorResponse: Response };

export type RequireAuthOptions = {
  allowServiceRole?: boolean;
  corsHeaders?: Record<string, string>;
};

export async function requireAuth(
  req: Request,
  opts?: RequireAuthOptions,
): Promise<AuthSuccess | AuthFailure> {
  const corsHeaders = opts?.corsHeaders ?? {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  };

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : authHeader;

  if (
    opts?.allowServiceRole &&
    bearer.length > 0 &&
    bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ) {
    return { user: null };
  }

  if (!authHeader) {
    return {
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: authHeader },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user };
}
