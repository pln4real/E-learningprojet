-- ============================================================
-- Messages du formulaire de contact
-- Supabase → SQL Editor → New query → coller → Run
-- Sans danger si relancé.
-- ============================================================
create table if not exists messages_contact (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text not null,
  sujet text not null,
  message text not null,
  user_id uuid references auth.users(id) on delete set null,
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);

alter table messages_contact enable row level security;

-- Tout le monde (connecté ou non) peut ENVOYER un message, avec des limites de taille.
-- Personne d'autre que les admins ne peut les LIRE.
drop policy if exists "Envoyer un message" on messages_contact;
create policy "Envoyer un message" on messages_contact for insert
  to anon, authenticated
  with check (
    char_length(trim(nom)) between 2 and 80
    and char_length(email) between 5 and 120
    and position('@' in email) > 1
    and char_length(sujet) between 1 and 60
    and char_length(trim(message)) between 10 and 2000
    and lu = false
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists "Admins lisent les messages" on messages_contact;
create policy "Admins lisent les messages" on messages_contact for select
  using (is_admin());
drop policy if exists "Admins modifient les messages" on messages_contact;
create policy "Admins modifient les messages" on messages_contact for update
  using (is_admin()) with check (is_admin());
drop policy if exists "Admins suppriment les messages" on messages_contact;
create policy "Admins suppriment les messages" on messages_contact for delete
  using (is_admin());

grant insert on messages_contact to anon, authenticated;
grant select, update, delete on messages_contact to authenticated;
