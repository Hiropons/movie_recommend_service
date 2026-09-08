begin;
alter table public.movies add column if not exists deleted_at timestamptz;
alter table public.movies drop constraint if exists movies_normalized_title_release_year_key;
create unique index if not exists movies_active_title_year on public.movies (normalized_title, coalesce(release_year, 0)) where deleted_at is null;
create or replace view public.movie_rankings with (security_invoker = true) as
select m.id, m.title, m.release_year, m.comment, m.status, m.created_at, count(v.movie_id)::integer as vote_count
from public.movies m left join public.votes v on v.movie_id = m.id
where m.deleted_at is null group by m.id;
revoke all on public.movie_rankings from public, anon, authenticated;
grant select on public.movie_rankings to service_role;
create table if not exists public.request_limits (bucket text primary key, hits integer not null, expires_at timestamptz not null);
create index if not exists request_limits_expiry on public.request_limits(expires_at);
alter table public.request_limits enable row level security;
revoke all on public.request_limits from public, anon, authenticated;
grant all on public.request_limits to service_role;
create or replace function public.consume_rate_limit(p_key text, p_seconds integer, p_limit integer)
returns boolean language plpgsql set search_path = '' as $$
declare n integer;
begin
  if p_seconds < 1 or p_limit < 1 then return false; end if;
  delete from public.request_limits where expires_at < now() - interval '1 day';
  insert into public.request_limits(bucket, hits, expires_at) values (p_key, 1, now() + make_interval(secs => p_seconds))
  on conflict (bucket) do update set
    hits = case when public.request_limits.expires_at <= now() then 1 else least(public.request_limits.hits + 1, p_limit + 1) end,
    expires_at = case when public.request_limits.expires_at <= now() then now() + make_interval(secs => p_seconds) else public.request_limits.expires_at end
  returning hits into n;
  return n <= p_limit;
end $$;
create or replace function public.recommend_movie(p_title text, p_normalized text, p_year integer, p_comment text, p_voter text)
returns uuid language plpgsql set search_path = '' as $$
declare movie uuid;
begin
  if length(p_normalized) = 0 or p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  insert into public.movies(title, normalized_title, release_year, comment) values (p_title, p_normalized, p_year, p_comment) returning id into movie;
  insert into public.votes(movie_id, voter_hash) values (movie, p_voter);
  return movie;
end $$;
create or replace function public.set_movie_vote(p_id uuid, p_voter text, p_voted boolean)
returns void language plpgsql set search_path = '' as $$
declare movie public.movies;
begin
  select * into movie from public.movies where id = p_id and deleted_at is null for update;
  if not found then raise exception 'movie_not_found'; end if;
  if movie.status = 'watched' then raise exception 'voting_closed'; end if;
  if p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  if p_voted then insert into public.votes(movie_id, voter_hash) values(p_id, p_voter) on conflict do nothing;
  else delete from public.votes where movie_id = p_id and voter_hash = p_voter; end if;
end $$;
create or replace function public.list_movies(p_voter text, p_search text, p_filter text, p_sort text, p_offset integer, p_limit integer)
returns jsonb language sql stable set search_path = '' as $$
  with filtered as (
    select r.*, exists(select 1 from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter) as voted
    from public.movie_rankings r join public.movies m on m.id = r.id
    where (p_filter = 'all' or (p_filter = 'watched' and r.status = 'watched') or (p_filter = 'unwatched' and r.status <> 'watched'))
      and (p_search = '' or position(p_search in m.normalized_title) > 0)
  ), page as (
    select * from filtered order by case when p_sort = 'votes' then vote_count end desc,
      case when p_sort = 'new' then created_at end desc, created_at asc, id asc
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  )
  select jsonb_build_object('movies', coalesce((select jsonb_agg(row_to_json(page)) from page), '[]'::jsonb), 'total', (select count(*) from filtered));
$$;
create or replace function public.touch_movie() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger movies_updated before update on public.movies for each row execute function public.touch_movie();
revoke all on public.movies, public.votes from public, anon, authenticated;
grant all on public.movies, public.votes to service_role;
revoke execute on function public.consume_rate_limit(text,integer,integer), public.recommend_movie(text,text,integer,text,text), public.set_movie_vote(uuid,text,boolean), public.list_movies(text,text,text,text,integer,integer), public.touch_movie() from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer), public.recommend_movie(text,text,integer,text,text), public.set_movie_vote(uuid,text,boolean), public.list_movies(text,text,text,text,integer,integer), public.touch_movie() to service_role;
commit;
