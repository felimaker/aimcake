-- =====================================================================
-- AimCake · Sistema de Roles, SuperAdmin y Gestión de Licencias
-- =====================================================================

-- 1. Tabla de roles de usuario
create table if not exists public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade unique,
    role text not null default 'user' check (role in ('user', 'super', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Política: El usuario puede ver su propio rol
drop policy if exists "Usuarios pueden ver su propio rol" on public.user_roles;
create policy "Usuarios pueden ver su propio rol"
    on public.user_roles for select
    using (auth.uid() = user_id);

-- Función segura para verificar si el usuario actual es SuperAdmin
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = auth.uid() and role = 'super'
    );
$$;

-- 2. Función RPC para que la UI consulte si el usuario logueado es SuperAdmin
create or replace function public.check_is_super()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    return public.is_super_admin();
end;
$$;

grant execute on function public.check_is_super() to authenticated;

-- 3. Función RPC para listar todos los usuarios con sus licencias y días restantes
-- Solo puede ser ejecutada si is_super_admin() es true
create or replace function public.admin_get_users()
returns table (
    user_id uuid,
    email text,
    name text,
    phone text,
    phone_confirmed boolean,
    created_at timestamptz,
    last_sign_in_at timestamptz,
    role text,
    license_id uuid,
    hwid text,
    status text,
    trial_start_at timestamptz,
    trial_end_at timestamptz,
    current_period_end timestamptz,
    days_left double precision
)
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_super_admin() then
        raise exception 'Acceso denegado. Se requiere rol de SuperAdmin.';
    end if;

    return query
    select 
        u.id as user_id,
        u.email::text,
        coalesce((u.raw_user_meta_data->>'display_name'), (u.raw_user_meta_data->>'full_name'), (u.raw_user_meta_data->>'name'), split_part(u.email, '@', 1)) as name,
        coalesce((u.raw_user_meta_data->>'phone'), u.phone)::text as phone,
        coalesce((u.raw_user_meta_data->>'phone_confirmed')::boolean, u.phone_confirmed_at is not null, false) as phone_confirmed,
        u.created_at,
        u.last_sign_in_at,
        coalesce(r.role, 'user') as role,
        l.id as license_id,
        l.hwid,
        coalesce(l.status, 'no_license') as status,
        l.trial_start_at,
        l.trial_end_at,
        l.current_period_end,
        case 
            when l.id is null then 0
            when l.status = 'active' and l.current_period_end is not null then
                greatest(0, extract(epoch from (l.current_period_end - now())) / 86400.0)
            when l.status = 'trial' and l.trial_end_at is not null then
                greatest(0, extract(epoch from (l.trial_end_at - now())) / 86400.0)
            else 0
        end as days_left
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.licenses l on l.user_id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_get_users() to authenticated;

-- 4. Función RPC para añadir o modificar días de suscripción / prueba a un usuario
create or replace function public.admin_adjust_user_days(
    target_user_id uuid,
    days_to_add integer,
    new_status text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_license public.licenses%rowtype;
    v_new_end timestamptz;
begin
    if not public.is_super_admin() then
        raise exception 'Acceso denegado. Se requiere rol de SuperAdmin.';
    end if;

    select * into v_license from public.licenses where user_id = target_user_id limit 1;

    if not found then
        -- Si el usuario no tiene registro de licencia aún, creamos uno
        insert into public.licenses (
            user_id,
            hwid,
            status,
            trial_start_at,
            trial_end_at,
            current_period_end
        )
        values (
            target_user_id,
            'manual_' || substring(target_user_id::text from 1 for 12),
            coalesce(new_status, 'active'),
            now(),
            now() + (days_to_add || ' days')::interval,
            now() + (days_to_add || ' days')::interval
        )
        returning * into v_license;
    else
        -- Si ya existe la licencia, calcular la nueva fecha sumando días desde el final actual o desde ahora si expiró
        if v_license.status = 'active' and v_license.current_period_end is not null and v_license.current_period_end > now() then
            v_new_end := v_license.current_period_end + (days_to_add || ' days')::interval;
        elsif v_license.status = 'trial' and v_license.trial_end_at is not null and v_license.trial_end_at > now() then
            v_new_end := v_license.trial_end_at + (days_to_add || ' days')::interval;
        else
            v_new_end := now() + (days_to_add || ' days')::interval;
        end if;

        update public.licenses
        set 
            status = coalesce(new_status, 'active'),
            current_period_end = v_new_end,
            trial_end_at = case when v_license.status = 'trial' then v_new_end else v_license.trial_end_at end,
            updated_at = now()
        where id = v_license.id
        returning * into v_license;
    end if;

    return json_build_object(
        'success', true,
        'license_id', v_license.id,
        'status', v_license.status,
        'new_end', coalesce(v_license.current_period_end, v_license.trial_end_at)
    );
end;
$$;

grant execute on function public.admin_adjust_user_days(uuid, integer, text) to authenticated;
