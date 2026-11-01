-- =====================================================================
-- AimCake · Plataforma Unificada: Ajustes, Pagos, Incentivos e IA
-- =====================================================================

-- 1. Tabla de configuración global de la plataforma (Solo accesible por SuperAdmin)
create table if not exists public.platform_settings (
    id text primary key default 'global',
    -- Pagos: Stripe
    stripe_enabled boolean not null default false,
    stripe_publishable_key text default '',
    stripe_secret_key text default '',
    stripe_webhook_secret text default '',
    -- Pagos: Square
    square_enabled boolean not null default false,
    square_application_id text default '',
    square_access_token text default '',
    square_location_id text default '',
    square_environment text not null default 'sandbox' check (square_environment in ('sandbox', 'production')),
    -- Incentivos y Días
    trial_days_default integer not null default 3,
    phone_bonus_days integer not null default 3,
    weekly_plan_days integer not null default 7,
    monthly_plan_days integer not null default 30,
    annual_plan_days integer not null default 365,
    -- Precios en USD
    weekly_price_usd numeric(10,2) not null default 5.00,
    monthly_price_usd numeric(10,2) not null default 15.00,
    annual_price_usd numeric(10,2) not null default 100.00,
    -- Configuración de IA (Gemini / OpenAI / Anthropic)
    ai_provider text not null default 'gemini' check (ai_provider in ('gemini', 'openai', 'anthropic')),
    ai_api_key text default '',
    ai_model text default 'gemini-1.5-flash',
    updated_at timestamptz not null default now()
);

-- Insertar configuración por defecto si no existe
insert into public.platform_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Política de RLS: solo lectura pública de configuraciones no sensibles (planes y días)
drop policy if exists "Lectura publica de parametros generales" on public.platform_settings;
create policy "Lectura publica de parametros generales"
    on public.platform_settings for select
    using (true);

-- RPC para que SuperAdmin lea la configuración COMPLETA (incluyendo API keys)
create or replace function public.admin_get_platform_settings()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conf public.platform_settings%rowtype;
begin
    if not public.is_super_admin() then
        raise exception 'Acceso denegado. Se requiere rol de SuperAdmin.';
    end if;

    select * into v_conf from public.platform_settings where id = 'global';
    return to_json(v_conf);
end;
$$;

grant execute on function public.admin_get_platform_settings() to authenticated;

-- RPC para que SuperAdmin actualice configuraciones
create or replace function public.admin_save_platform_settings(new_settings jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conf public.platform_settings%rowtype;
begin
    if not public.is_super_admin() then
        raise exception 'Acceso denegado. Se requiere rol de SuperAdmin.';
    end if;

    update public.platform_settings
    set
        stripe_enabled = coalesce((new_settings->>'stripe_enabled')::boolean, stripe_enabled),
        stripe_publishable_key = coalesce(new_settings->>'stripe_publishable_key', stripe_publishable_key),
        stripe_secret_key = coalesce(new_settings->>'stripe_secret_key', stripe_secret_key),
        stripe_webhook_secret = coalesce(new_settings->>'stripe_webhook_secret', stripe_webhook_secret),
        square_enabled = coalesce((new_settings->>'square_enabled')::boolean, square_enabled),
        square_application_id = coalesce(new_settings->>'square_application_id', square_application_id),
        square_access_token = coalesce(new_settings->>'square_access_token', square_access_token),
        square_location_id = coalesce(new_settings->>'square_location_id', square_location_id),
        square_environment = coalesce(new_settings->>'square_environment', square_environment),
        trial_days_default = coalesce((new_settings->>'trial_days_default')::integer, trial_days_default),
        phone_bonus_days = coalesce((new_settings->>'phone_bonus_days')::integer, phone_bonus_days),
        weekly_plan_days = coalesce((new_settings->>'weekly_plan_days')::integer, weekly_plan_days),
        monthly_plan_days = coalesce((new_settings->>'monthly_plan_days')::integer, monthly_plan_days),
        annual_plan_days = coalesce((new_settings->>'annual_plan_days')::integer, annual_plan_days),
        weekly_price_usd = coalesce((new_settings->>'weekly_price_usd')::numeric, weekly_price_usd),
        monthly_price_usd = coalesce((new_settings->>'monthly_price_usd')::numeric, monthly_price_usd),
        annual_price_usd = coalesce((new_settings->>'annual_price_usd')::numeric, annual_price_usd),
        ai_provider = coalesce(new_settings->>'ai_provider', ai_provider),
        ai_api_key = coalesce(new_settings->>'ai_api_key', ai_api_key),
        ai_model = coalesce(new_settings->>'ai_model', ai_model),
        updated_at = now()
    where id = 'global'
    returning * into v_conf;

    return to_json(v_conf);
end;
$$;

grant execute on function public.admin_save_platform_settings(jsonb) to authenticated;

-- RPC para adjudicación de bonificación por teléfono verificado
create or replace function public.claim_phone_bonus()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_bonus_days integer;
    v_license public.licenses%rowtype;
    v_user record;
    v_new_end timestamptz;
begin
    if v_uid is null then
        return json_build_object('success', false, 'reason', 'Debes iniciar sesión.');
    end if;

    select phone_bonus_days into v_bonus_days from public.platform_settings where id = 'global';
    v_bonus_days := coalesce(v_bonus_days, 3);

    -- Verificar si el usuario ya recibió la bonificación
    select * into v_license from public.licenses where user_id = v_uid limit 1;

    if not found then
        return json_build_object('success', false, 'reason', 'No hay licencia registrada para este usuario.');
    end if;

    -- Comprobar metadatos de usuario
    select raw_user_meta_data into v_user from auth.users where id = v_uid;
    if coalesce((v_user.raw_user_meta_data->>'phone_bonus_granted')::boolean, false) then
        return json_build_object('success', false, 'reason', 'Esta cuenta ya recibió su bonificación de teléfono.');
    end if;

    -- Calcular nueva fecha sumando los días de bonificación
    if v_license.trial_end_at is not null and v_license.trial_end_at > now() then
        v_new_end := v_license.trial_end_at + (v_bonus_days || ' days')::interval;
    elsif v_license.current_period_end is not null and v_license.current_period_end > now() then
        v_new_end := v_license.current_period_end + (v_bonus_days || ' days')::interval;
    else
        v_new_end := now() + (v_bonus_days || ' days')::interval;
    end if;

    update public.licenses
    set
        trial_end_at = case when v_license.status = 'trial' then v_new_end else v_license.trial_end_at end,
        current_period_end = case when v_license.status = 'active' then v_new_end else v_license.current_period_end end,
        status = case when v_license.status = 'expired' then 'trial' else v_license.status end,
        updated_at = now()
    where id = v_license.id;

    -- Marcar que la bonificación ya fue otorgada en los metadatos de auth.users
    update auth.users
    set raw_user_meta_data = raw_user_meta_data || '{"phone_bonus_granted": true, "phone_confirmed": true}'::jsonb
    where id = v_uid;

    return json_build_object(
        'success', true,
        'bonus_days', v_bonus_days,
        'new_end', v_new_end
    );
end;
$$;

grant execute on function public.claim_phone_bonus() to authenticated;
