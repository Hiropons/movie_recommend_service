-- TMDB（The Movie Database）の作品と紐づける。
-- 同じ映画が「インターステラー」「Interstellar」と別々に登録されるのを、TMDBのIDで防ぐ。
begin;

alter table public.movies add column if not exists tmdb_id integer;
alter table public.movies add column if not exists poster_path text;

alter table public.movies drop constraint if exists movies_poster_path_shape;
alter table public.movies add constraint movies_poster_path_shape
  check (poster_path is null or poster_path ~ '^/[A-Za-z0-9._-]{1,120}$');

-- TMDBから選ばれた作品は、IDが同じなら同一作品。
-- 手入力（TMDBで見つからなかった作品）は tmdb_id が null になるので、
-- 従来どおり「作品名＋公開年」で重複を防ぐ。両方の制約が並立する。
create unique index if not exists movies_active_tmdb_id
  on public.movies (tmdb_id) where deleted_at is null and tmdb_id is not null;

drop view if exists public.movie_rankings;
create view public.movie_rankings with (security_invoker = true) as
select m.id, m.title, m.release_year, m.status, m.created_at, m.tmdb_id, m.poster_path,
  count(v.movie_id)::integer as vote_count,
  count(v.movie_id) filter (where v.comment <> '')::integer as comment_count
from public.movies m left join public.votes v on v.movie_id = m.id
where m.deleted_at is null group by m.id;
revoke all on public.movie_rankings from public, anon, authenticated;
grant select on public.movie_rankings to service_role;

drop function if exists public.recommend_movie(text, text, integer, text, text, text);
create function public.recommend_movie(
  p_title text, p_normalized text, p_year integer, p_comment text,
  p_voter text, p_nickname text, p_tmdb_id integer, p_poster text)
returns uuid language plpgsql set search_path = '' as $$
declare movie uuid;
begin
  if length(p_normalized) = 0 or p_voter !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  insert into public.movies(title, normalized_title, release_year, tmdb_id, poster_path)
  values (p_title, p_normalized, p_year, p_tmdb_id, p_poster)
  returning id into movie;
  insert into public.votes(movie_id, voter_hash, comment, nickname) values (movie, p_voter, p_comment, p_nickname);
  return movie;
end $$;

-- 作品ページの詳細。ポスターとTMDB IDも返す。
create or replace function public.movie_detail(p_id uuid, p_voter text)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'movie', jsonb_build_object(
      'id', r.id, 'title', r.title, 'release_year', r.release_year, 'status', r.status,
      'created_at', r.created_at, 'vote_count', r.vote_count, 'comment_count', r.comment_count,
      'tmdb_id', r.tmdb_id, 'poster_path', r.poster_path,
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
  public.recommend_movie(text, text, integer, text, text, text, integer, text),
  public.movie_detail(uuid, text)
  from public, anon, authenticated;
grant execute on function
  public.recommend_movie(text, text, integer, text, text, text, integer, text),
  public.movie_detail(uuid, text)
  to service_role;

commit;
