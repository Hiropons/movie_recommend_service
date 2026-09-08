create extension if not exists pgcrypto;

create table public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  normalized_title text not null,
  release_year integer check (release_year between 1888 and 2100),
  comment text not null default '' check (char_length(comment) <= 300),
  status text not null default 'unwatched' check (status in ('unwatched', 'next', 'watched')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (normalized_title, release_year)
);

create table public.votes (
  movie_id uuid not null references public.movies(id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  primary key (movie_id, voter_hash)
);

create index movies_status_created_at_idx on public.movies(status, created_at desc);
create index votes_movie_id_idx on public.votes(movie_id);

alter table public.movies enable row level security;
alter table public.votes enable row level security;

revoke all on public.movies from anon, authenticated;
revoke all on public.votes from anon, authenticated;
grant all on public.movies to service_role;
grant all on public.votes to service_role;

create or replace view public.movie_rankings
with (security_invoker = false)
as
select m.id, m.title, m.release_year, m.comment, m.status, m.created_at,
       count(v.movie_id)::integer as vote_count
from public.movies m
left join public.votes v on v.movie_id = m.id
group by m.id;

revoke all on public.movie_rankings from anon, authenticated;
grant select on public.movie_rankings to service_role;
