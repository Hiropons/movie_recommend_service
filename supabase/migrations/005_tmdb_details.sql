-- 監督・あらすじ・上映時間をTMDBから取り込んで保存する。
-- これらは作品ごとに1つしかない事実なので、投稿者の入力ではなくTMDBを正とする。
begin;

alter table public.movies add column if not exists director text not null default '';
alter table public.movies add column if not exists overview text not null default '';
alter table public.movies add column if not exists runtime integer;

alter table public.movies drop constraint if exists movies_director_length;
alter table public.movies add constraint movies_director_length check (char_length(director) <= 120);
alter table public.movies drop constraint if exists movies_overview_length;
alter table public.movies add constraint movies_overview_length check (char_length(overview) <= 2000);
alter table public.movies drop constraint if exists movies_runtime_range;
alter table public.movies add constraint movies_runtime_range check (runtime is null or (runtime > 0 and runtime <= 2000));

drop view if exists public.movie_rankings;
create view public.movie_rankings with (security_invoker = true) as
select m.id, m.title, m.release_year, m.status, m.created_at, m.tmdb_id, m.poster_path,
  m.director, m.overview, m.runtime,
  count(v.movie_id)::integer as vote_count,
  count(v.movie_id) filter (where v.comment <> '')::integer as comment_count
from public.movies m left join public.votes v on v.movie_id = m.id
where m.deleted_at is null group by m.id;
revoke all on public.movie_rankings from public, anon, authenticated;
grant select on public.movie_rankings to service_role;

-- 稼働中のサイトを止めないため、旧8引数版はここでは消さない。
-- SQLを流した時点ではまだ旧コードが動いており、そちらは旧版を呼び続ける。
-- 新コードのデプロイ後に 006 で旧版を落とす。
create or replace function public.recommend_movie(
  p_title text, p_normalized text, p_year integer, p_comment text, p_voter text, p_nickname text,
  p_tmdb_id integer, p_poster text, p_director text, p_overview text, p_runtime integer)
returns uuid language plpgsql set search_path = '' as $$
declare movie uuid;
begin
  if length(p_normalized) = 0 or p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  insert into public.movies(title, normalized_title, release_year, tmdb_id, poster_path, director, overview, runtime)
  values (p_title, p_normalized, p_year, p_tmdb_id, p_poster, p_director, p_overview, p_runtime)
  returning id into movie;
  insert into public.votes(movie_id, voter_hash, comment, nickname) values (movie, p_voter, p_comment, p_nickname);
  return movie;
end $$;

create or replace function public.movie_detail(p_id uuid, p_voter text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'movie', jsonb_build_object(
      'id', r.id, 'title', r.title, 'release_year', r.release_year, 'status', r.status,
      'created_at', r.created_at, 'vote_count', r.vote_count, 'comment_count', r.comment_count,
      'tmdb_id', r.tmdb_id, 'poster_path', r.poster_path,
      'director', r.director, 'overview', r.overview, 'runtime', r.runtime,
      'voted', exists (select 1 from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter),
      'my_comment', coalesce((select v.comment from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter), ''),
      'my_nickname', coalesce((select v.nickname from public.votes v where v.movie_id = r.id and v.voter_hash = p_voter), '')
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.comment_id, 'nickname', c.nickname, 'comment', c.comment,
        'created_at', c.created_at, 'mine', c.voter_hash = p_voter
      ) order by c.created_at desc)
      from public.votes c where c.movie_id = r.id and c.comment <> ''
    ), '[]'::jsonb)
  )
  from public.movie_rankings r where r.id = p_id;
$$;

revoke execute on function
  public.recommend_movie(text, text, integer, text, text, text, integer, text, text, text, integer),
  public.movie_detail(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recommend_movie(text, text, integer, text, text, text, integer, text, text, text, integer),
  public.movie_detail(uuid, text)
  to service_role;

commit;
