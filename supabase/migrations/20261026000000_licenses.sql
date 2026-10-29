-- =====================================================================
-- Xbox Controller Bridge · Esquema de licencias (Módulo 6.3 del blueprint)
-- Ejecutar en la consola SQL de Supabase o con `supabase db push`.
-- =====================================================================

-- 1. Tabla de Dispositivos y Licencias
create table if not exists public.licenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    hwid text not null unique,
    status text not null default 'trial' check (status in ('trial', 'active', 'expired')),
    trial_start_at timestamptz not null default now(),
    trial_end_at timestamptz not null default (now() + interval '3 days'),
    stripe_customer_id text,
    stripe_subscription_id text,
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists licenses_user_id_idx on public.licenses (user_id);
create index if not exists licenses_subscription_idx on public.licenses (stripe_subscription_id);

-- Habilitar RLS: los usuarios solo pueden leer su propia licencia.
-- Las escrituras se realizan únicamente mediante la función SECURITY DEFINER
-- o con la service role (webhook de Stripe).
alter table public.licenses enable row level security;

drop policy if exists "Lectura de usuario para su propia licencia" on public.licenses;
create policy "Lectura de usuario para su propia licencia"
    on public.licenses for select
    using (auth.uid() = user_id);

-- 2. Función almacenada para registrar dispositivo con trial único de 3 días
create or replace function public.register_or_validate_device(device_hwid text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_license public.licenses%rowtype;
    v_now timestamptz := now();
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        return json_build_object('allowed', false, 'reason', 'Debes iniciar sesión.');
    end if;

    if device_hwid is null or length(device_hwid) <> 64 then
        return json_build_object('allowed', false, 'reason', 'HWID inválido.');
    end if;

    -- Buscar si el HWID ya fue registrado
    select * into v_license from public.licenses where hwid = device_hwid;

    if not found then
        -- Primer registro del dispositivo: se otorgan 3 días
        insert into public.licenses (user_id, hwid, status, trial_start_at, trial_end_at)
        values (v_uid, device_hwid, 'trial', v_now, v_now + interval '3 days')
        returning * into v_license;
    else
        -- Si el HWID ya existe pero el usuario actual es diferente, rechazar asignación fraudulenta
        if v_license.user_id is distinct from v_uid then
            return json_build_object('allowed', false, 'reason', 'HWID ya registrado con otra cuenta.');
        end if;
    end if;

    -- Comprobar estado de vigencia
    if v_license.status = 'active'
       and (v_license.current_period_end is null or v_license.current_period_end > v_now) then
        return json_build_object(
            'allowed', true,
            'status', 'active',
            'expires_at', coalesce(extract(epoch from v_license.current_period_end)::bigint, 9999999999)
        );
    elsif v_license.status = 'trial' and v_license.trial_end_at > v_now then
        return json_build_object(
            'allowed', true,
            'status', 'trial',
            'expires_at', extract(epoch from v_license.trial_end_at)::bigint
        );
    else
        if v_license.status = 'trial' then
            update public.licenses set status = 'expired', updated_at = v_now where id = v_license.id;
            return json_build_object('allowed', false, 'reason', 'El periodo de prueba de 3 dias ha expirado.');
        end if;
        return json_build_object('allowed', false, 'reason', 'Tu suscripción no está activa.');
    end if;
end;
$$;

revoke all on function public.register_or_validate_device(text) from public, anon;
grant execute on function public.register_or_validate_device(text) to authenticated;
